import { beforeAll, describe, expect, it } from 'vitest'
import { computeOrgUsage } from '../src/services/billing/entitlements.js'
import { PROJECT_FILE_LIMITS } from '../src/services/storage/projectFileValidation.js'
import { api, bearer, createOrg, createProgram, createProgramProject, createUserWithToken, PASSWORD, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type ApiFile = { id: string; name: string; url: string | null; fileType: string; mimeType: string | null; sizeBytes: number | null }

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const HWP = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(504),
  Buffer.from('HWP Document File'),
  Buffer.alloc(64),
])

/** Minimal stored (uncompressed) ZIP; the server reads only the central directory. */
function zip(entries: Record<string, string>) {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const fileName = Buffer.from(name)
    const data = Buffer.from(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(fileName.length, 26)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt32LE(data.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(fileName.length, 28)
    header.writeUInt32LE(offset, 42)
    parts.push(local, fileName, data)
    central.push(header, fileName)
    offset += 30 + fileName.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length / 2, 8)
  end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, directory, end])
}

const OOXML = { '[Content_Types].xml': '<Types/>', '_rels/.rels': '<Relationships/>' }
const DOCX = zip({ ...OOXML, 'word/document.xml': '<w:document/>' })
const PPTX = zip({ ...OOXML, 'ppt/presentation.xml': '<p:presentation/>' })
const XLSX = zip({ ...OOXML, 'xl/workbook.xml': '<workbook/>' })
const HWPX = zip({ mimetype: 'application/hwp+zip', 'Contents/header.xml': '<hh:head/>', 'Contents/section0.xml': '<hs:sec/>' })
const MACRO_DOCX = zip({ ...OOXML, 'word/document.xml': '<w:document/>', 'word/vbaProject.bin': 'macro' })
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)])

let owner: Actor
let editor: Actor
let viewer: Actor
let outsider: Actor
let projectId: string

const upload = (actor: Actor, files: [Buffer, string][], fields: Record<string, string> = {}, target = projectId) => {
  let request = api().post(`/api/projects/${target}/files`).set(bearer(actor.token))
  for (const [key, value] of Object.entries(fields)) request = request.field(key, value)
  for (const [buffer, name] of files) request = request.attach('files', buffer, name)
  return request
}

const fileUrl = (actor: Actor, fileId: string, download = false) =>
  api().get(`/api/projects/${projectId}/files/${fileId}/url${download ? '?download=1' : ''}`).set(bearer(actor.token))

const fetchSigned = (url: string) => api().get(`/api${url}`).buffer(true).parse((res, done) => {
  const chunks: Buffer[] = []
  res.on('data', (chunk: Buffer) => chunks.push(chunk))
  res.on('end', () => done(null, Buffer.concat(chunks)))
})

/** Direct adds always land on the editor role; other roles are assigned afterwards. */
const addMember = async (actor: Actor, slug: 'editor' | 'viewer') => {
  const response = await api().post(`/api/projects/${projectId}/members`).set(bearer(owner.token)).send({ email: actor.user.email, role: slug })
  expect(response.status).toBe(201)
  const role = await prisma.projectRole.findUniqueOrThrow({ where: { projectId_slug: { projectId, slug } } })
  await prisma.projectMember.update({ where: { projectId_userId: { projectId, userId: actor.user.id } }, data: { roleId: role.id, role: role.name } })
}

beforeAll(async () => {
  await resetDb()
  owner = await createUserWithToken({ name: '파일 주인' })
  editor = await createUserWithToken({ name: '편집 팀원' })
  viewer = await createUserWithToken({ name: '보기 팀원' })
  outsider = await createUserWithToken({ name: '외부인' })
  const created = await api().post('/api/projects').set(bearer(owner.token)).send({ title: '산출물 정리', visibility: 'team' })
  expect(created.status).toBe(201)
  projectId = created.body.project.id
  await addMember(editor, 'editor')
  await addMember(viewer, 'viewer')
})

describe('project file uploads', () => {
  it('stores photos, PDF and office/Hangul documents and never returns storage internals', async () => {
    const response = await upload(owner, [
      [PDF, '기획서.pdf'],
      [PNG, '화면.png'],
      [DOCX, '회의록.docx'],
      [PPTX, '발표.pptx'],
      [XLSX, '예산.xlsx'],
      [HWP, '보고서.hwp'],
      [HWPX, '보고서.hwpx'],
    ])
    expect(response.status).toBe(201)
    const files = response.body.files as ApiFile[]
    expect(files.map((file) => [file.name, file.fileType, file.url])).toEqual([
      ['기획서.pdf', 'PDF', null],
      ['화면.png', '이미지', null],
      ['회의록.docx', '문서', null],
      ['발표.pptx', '발표자료', null],
      ['예산.xlsx', '스프레드시트', null],
      ['보고서.hwp', '한글 문서', null],
      ['보고서.hwpx', '한글 문서', null],
    ])
    expect(files[0]).toMatchObject({ mimeType: 'application/pdf', sizeBytes: PDF.length })

    const detail = await api().get(`/api/projects/${projectId}`).set(bearer(editor.token))
    expect(detail.status).toBe(200)
    expect(detail.body.project.files).toHaveLength(7)
    expect(JSON.stringify(detail.body)).not.toMatch(/storageKey|sha256|scanStatus|projects\//)

    const rows = await prisma.projectFile.findMany({ where: { projectId } })
    expect(rows.every((row) => row.storageKey?.startsWith(`projects/${projectId}/`) && row.sha256?.length === 64)).toBe(true)
  })

  it('applies a type label given by the uploader', async () => {
    const response = await upload(editor, [[PDF, 'brief.pdf']], { fileType: '디자인 시안' })
    expect(response.status).toBe(201)
    expect(response.body.files[0]).toMatchObject({ name: 'brief.pdf', fileType: '디자인 시안' })
  })

  it('serves uploads through short-lived URLs: media inline, documents always as attachments', async () => {
    const files = await prisma.projectFile.findMany({ where: { projectId }, select: { id: true, name: true } })
    const byName = (name: string) => files.find((file) => file.name === name)!.id

    const pdf = await fileUrl(viewer, byName('기획서.pdf'))
    expect(pdf.status).toBe(200)
    expect(pdf.headers['cache-control']).toBe('no-store')
    const pdfBody = await fetchSigned(pdf.body.url)
    expect(pdfBody.status).toBe(200)
    expect(pdfBody.headers['content-type']).toBe('application/pdf')
    expect(pdfBody.headers['content-disposition']).toMatch(/^inline/)
    expect(Buffer.compare(pdfBody.body as Buffer, PDF)).toBe(0)

    const pdfDownload = await fetchSigned((await fileUrl(viewer, byName('기획서.pdf'), true)).body.url)
    expect(pdfDownload.headers['content-disposition']).toMatch(/^attachment/)

    const docx = await fetchSigned((await fileUrl(viewer, byName('회의록.docx'))).body.url)
    expect(docx.status).toBe(200)
    expect(docx.headers['content-disposition']).toMatch(/^attachment/)
    expect(docx.headers['content-disposition']).toContain(encodeURIComponent('회의록.docx'))
  })

  it('rejects macro documents, disguised files and unsupported formats without storing anything', async () => {
    const before = await prisma.projectFile.count({ where: { projectId } })
    const macro = await upload(owner, [[MACRO_DOCX, 'macro.docx']])
    expect(macro.status).toBe(400)
    expect(macro.body.message).toContain('매크로')
    expect((await upload(owner, [[EXE, 'setup.docx']])).body.message).toContain('일치하지 않습니다')
    expect((await upload(owner, [[DOCX, 'fake.pdf']])).body.message).toContain('일치하지 않습니다')
    expect((await upload(owner, [[HWPX, 'notes.docx']])).status).toBe(400)
    expect((await upload(owner, [[DOCX, 'archive.zip']])).body.message).toContain('만 올릴 수 있습니다')
    expect((await upload(owner, [[EXE, 'tool.exe']])).status).toBe(400)
    const mixed = await upload(owner, [[PDF, 'ok.pdf'], [MACRO_DOCX, 'bad.docx']])
    expect(mixed.status).toBe(400)
    expect(await prisma.projectFile.count({ where: { projectId } })).toBe(before)
    expect((await upload(owner, [])).status).toBe(400)
  })

  it('checks project permissions for upload, view and delete', async () => {
    const someFile = await prisma.projectFile.findFirstOrThrow({ where: { projectId, uploadedBy: owner.user.id } })

    expect((await upload(viewer, [[PDF, 'viewer.pdf']])).status).toBe(403)
    expect((await upload(outsider, [[PDF, 'outsider.pdf']])).status).toBe(403)
    expect((await fileUrl(outsider, someFile.id)).status).toBe(404)
    expect((await api().delete(`/api/projects/${projectId}/files/${someFile.id}`).set(bearer(viewer.token))).status).toBe(403)
    expect((await api().delete(`/api/projects/${projectId}/files/${someFile.id}`).set(bearer(editor.token))).status).toBe(403)
    expect((await api().delete(`/api/projects/${projectId}/files/${someFile.id}`).set(bearer(outsider.token))).status).toBe(404)

    const own = (await upload(editor, [[PNG, 'mine.png']])).body.files[0] as ApiFile
    const signed = (await fileUrl(editor, own.id)).body.url as string
    expect((await api().delete(`/api/projects/${projectId}/files/${own.id}`).set(bearer(editor.token))).status).toBe(204)
    expect((await fetchSigned(signed)).status).toBe(404)

    const editorFile = (await upload(editor, [[PDF, 'review.pdf']])).body.files[0] as ApiFile
    expect((await api().delete(`/api/projects/${projectId}/files/${editorFile.id}`).set(bearer(owner.token))).status).toBe(204)
    expect(await prisma.projectFile.count({ where: { id: editorFile.id } })).toBe(0)
  })

  it('keeps public viewers away from files of a public project', async () => {
    expect((await api().patch(`/api/projects/${projectId}`).set(bearer(owner.token)).send({ visibility: 'public' })).status).toBe(200)
    const someFile = await prisma.projectFile.findFirstOrThrow({ where: { projectId } })
    const detail = await api().get(`/api/projects/${projectId}`).set(bearer(outsider.token))
    expect(detail.status).toBe(200)
    expect(detail.body.project.files).toEqual([])
    expect((await fileUrl(outsider, someFile.id)).status).toBe(403)
    expect((await api().patch(`/api/projects/${projectId}`).set(bearer(owner.token)).send({ visibility: 'team' })).status).toBe(200)
  })

  it('still accepts JSON links, which have no download URL', async () => {
    const response = await api()
      .post(`/api/projects/${projectId}/files`)
      .set(bearer(editor.token))
      .send({ name: '디자인 시안', url: 'https://figma.com/file/abc', fileType: '디자인' })
    expect(response.status).toBe(201)
    expect(response.body.file).toMatchObject({ url: 'https://figma.com/file/abc', mimeType: null, sizeBytes: null })
    expect(response.body.file.storageKey).toBeUndefined()
    expect((await fileUrl(viewer, response.body.file.id)).status).toBe(404)
  })

  it('enforces the personal project file count and storage quota', async () => {
    const existing = await prisma.projectFile.count({ where: { projectId, storageKey: { not: null } } })
    const fillers = Array.from({ length: PROJECT_FILE_LIMITS.maxFilesPerProject - existing }, (_, index) => ({
      projectId,
      uploadedBy: owner.user.id,
      name: `filler-${index}.pdf`,
      fileType: 'PDF',
      storageKey: `quota-test/${index}`,
      mimeType: 'application/pdf',
      sizeBytes: 1,
    }))
    await prisma.projectFile.createMany({ data: fillers })
    const full = await upload(owner, [[PDF, 'one-more.pdf']])
    expect(full.status).toBe(409)
    expect(full.body.message).toContain(`${PROJECT_FILE_LIMITS.maxFilesPerProject}개`)
    await prisma.projectFile.deleteMany({ where: { storageKey: { startsWith: 'quota-test/' } } })

    await prisma.projectFile.create({
      data: {
        projectId,
        uploadedBy: owner.user.id,
        name: 'huge.mp4',
        fileType: '영상',
        storageKey: 'quota-test/huge',
        mimeType: 'video/mp4',
        sizeBytes: PROJECT_FILE_LIMITS.maxBytesPerProject,
      },
    })
    const tooBig = await upload(owner, [[PDF, 'small.pdf']])
    expect(tooBig.status).toBe(409)
    expect(tooBig.body.message).toContain('용량')
    await prisma.projectFile.deleteMany({ where: { storageKey: { startsWith: 'quota-test/' } } })
    expect((await upload(owner, [[PDF, 'fits.pdf']])).status).toBe(201)
  })

  it('counts program project files against the organization storage allowance', async () => {
    const org = await createOrg(owner.user.id, { name: '파일대학' })
    const program = await createProgram(org.id, { participantIds: [owner.user.id] })
    const programProject = await createProgramProject(program.id, owner.user.id, [owner.user.id])
    await prisma.projectFile.create({
      data: {
        projectId: programProject.id,
        uploadedBy: owner.user.id,
        name: 'demo.mp4',
        fileType: '영상',
        storageKey: `quota-test/org-${programProject.id}`,
        mimeType: 'video/mp4',
        sizeBytes: 1024 * 1024 * 1024,
      },
    })
    const usage = await computeOrgUsage(org.id, null)
    expect(usage.storageGb).toBe(1)
    await prisma.projectFile.deleteMany({ where: { projectId: programProject.id } })
  })

  it('removes stored objects when a personal project is deleted', async () => {
    const created = await api().post('/api/projects').set(bearer(owner.token)).send({ title: '지울 프로젝트' })
    const target = created.body.project.id as string
    const file = (await upload(owner, [[PDF, 'temp.pdf']], {}, target)).body.files[0] as ApiFile
    const signed = await api().get(`/api/projects/${target}/files/${file.id}/url`).set(bearer(owner.token))
    expect((await fetchSigned(signed.body.url)).status).toBe(200)
    expect((await api().delete(`/api/projects/${target}`).set(bearer(owner.token)).send({ password: PASSWORD })).status).toBe(204)
    expect((await fetchSigned(signed.body.url)).status).toBe(404)
  })
})
