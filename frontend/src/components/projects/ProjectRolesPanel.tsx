import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Shield } from 'lucide-react'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Input, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { PERMISSION_GROUPS } from '../../lib/projectPermissions'
import {
  createProjectRole,
  deleteProjectRole,
  getPermissionCatalog,
  updateProjectRole,
} from '../../services/projectService'
import type { ProjectPermission, ProjectRole } from '../../types/projectRole'

type ProjectRolesPanelProps = {
  projectId: string
  token: string
  roles: ProjectRole[]
  onUpdated: () => void
}

export function ProjectRolesPanel({ projectId, token, roles, onUpdated }: ProjectRolesPanelProps) {
  const queryClient = useQueryClient()
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    permissions: [] as ProjectPermission[],
  })

  const catalogQuery = useQuery({
    queryKey: ['projects', 'permission-catalog'],
    queryFn: () => getPermissionCatalog(token),
    enabled: Boolean(token),
  })

  const labelByKey = useMemo(() => {
    const map = new Map<ProjectPermission, string>()
    for (const item of catalogQuery.data?.permissions ?? []) {
      map.set(item.key, item.label)
    }
    return map
  }, [catalogQuery.data])

  const resetForm = () => {
    setEditingRoleId(null)
    setForm({ name: '', description: '', permissions: [] })
  }

  const startCreate = () => {
    resetForm()
    setForm({ name: '', description: '', permissions: ['project.view', 'tasks.view', 'files.view'] })
    setEditingRoleId('new')
  }

  const startEdit = (role: ProjectRole) => {
    setEditingRoleId(role.id)
    setForm({
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        permissions: form.permissions,
      }
      if (editingRoleId === 'new') {
        await createProjectRole(token, projectId, payload)
        return
      }
      if (editingRoleId) {
        await updateProjectRole(token, projectId, editingRoleId, payload)
      }
    },
    onSuccess: () => {
      resetForm()
      onUpdated()
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => deleteProjectRole(token, projectId, roleId),
    onSuccess: () => {
      onUpdated()
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })

  const togglePermission = (permission: ProjectPermission) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((item) => item !== permission)
        : [...prev.permissions, permission],
    }))
  }

  return (
    <div className="space-y-4 rounded-xl border border-surface-border bg-surface-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-brand-600">
            <Shield size={18} />
            <p className="text-sm font-bold">역할 · 권한</p>
          </div>
          <p className="text-sm text-ink-muted">
            프로젝트별 역할을 만들고, 각 역할에 세부 권한을 부여할 수 있습니다.
          </p>
        </div>
        <Button className="rounded-full" onClick={startCreate} type="button" variant="secondary">
          <Plus className="mr-1" size={16} />
          역할 추가
        </Button>
      </div>

      <div className="space-y-2">
        {roles.map((role) => (
          <div className="rounded-xl border border-surface-border bg-white p-4" key={role.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-ink-strong">{role.name}</p>
                  {role.isSystem ? <Badge tone="purple">기본</Badge> : null}
                  {role.slug === 'owner' ? <Badge tone="blue">소유자 전용</Badge> : null}
                </div>
                {role.description ? <p className="mt-1 text-sm text-ink-muted">{role.description}</p> : null}
                <p className="mt-2 text-xs text-ink-muted">
                  권한 {role.permissions.length}개 · {role.permissions.map((p) => labelByKey.get(p) ?? p).join(', ')}
                </p>
              </div>
              <div className="flex gap-2">
                {role.slug !== 'owner' ? (
                  <Button className="h-8 rounded-full px-3 text-xs" onClick={() => startEdit(role)} type="button" variant="ghost">
                    수정
                  </Button>
                ) : null}
                {!role.isSystem ? (
                  <Button
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(role.id)}
                    type="button"
                    variant="danger"
                  >
                    삭제
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editingRoleId ? (
        <form
          className="space-y-4 rounded-xl border border-brand-200 bg-white p-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            saveMutation.mutate()
          }}
        >
          <p className="font-bold text-ink-strong">{editingRoleId === 'new' ? '새 역할' : '역할 수정'}</p>
          <Input
            label="역할 이름"
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
            value={form.name}
          />
          <Textarea
            label="설명"
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            value={form.description}
          />

          {catalogQuery.isLoading ? <LoadingState /> : null}
          {catalogQuery.data ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink-strong">권한 선택</p>
              {PERMISSION_GROUPS.map((group) => (
                <div className="rounded-lg border border-surface-border p-3" key={group.title}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{group.title}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.permissions.map((permission) => {
                      const label = labelByKey.get(permission) ?? permission
                      const checked = form.permissions.includes(permission)
                      return (
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted/60"
                          key={permission}
                        >
                          <input
                            checked={checked}
                            onChange={() => togglePermission(permission)}
                            type="checkbox"
                          />
                          <span className="text-sm text-ink-body">{label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {saveMutation.error ? (
            <p className="text-sm text-red-600">{saveMutation.error.message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button onClick={resetForm} type="button" variant="secondary">
              취소
            </Button>
            <Button disabled={saveMutation.isPending || form.permissions.length === 0} type="submit">
              {saveMutation.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
