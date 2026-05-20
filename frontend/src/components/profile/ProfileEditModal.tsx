import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera, X } from 'lucide-react'
import { ImageCropDialog } from './ImageCropDialog'
import { Avatar } from '../common/Avatar'
import { cn } from '../../lib/cn'
import type { ImageUploadPreset } from '../../lib/readImageFile'

export type ProfileEditFormState = {
  headline: string
  bio: string
  school: string
  company: string
  location: string
  skills: string
  interests: string
  website: string
  github: string
  linkedin: string
}

type ProfileEditModalProps = {
  open: boolean
  userName: string
  form: ProfileEditFormState
  avatarUrl: string | null
  coverUrl: string | null
  isSaving: boolean
  errorMessage?: string
  onClose: () => void
  onChange: (patch: Partial<ProfileEditFormState>) => void
  onAvatarChange: (url: string | null) => void
  onCoverChange: (url: string | null) => void
  onSubmit: () => void
}

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-[3px] focus:ring-blue-500/15'

const labelClass = 'text-[13px] font-semibold text-slate-600'

export function ProfileEditModal({
  open,
  userName,
  form,
  avatarUrl,
  coverUrl,
  isSaving,
  errorMessage,
  onClose,
  onChange,
  onAvatarChange,
  onCoverChange,
  onSubmit,
}: ProfileEditModalProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [cropTarget, setCropTarget] = useState<'avatar' | 'cover' | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)

  useEffect(() => {
    if (!open) {
      setCropTarget(null)
      setCropFile(null)
      setImageError(null)
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const openCrop = (file: File | undefined, target: 'avatar' | 'cover') => {
    if (!file || !file.type.startsWith('image/')) {
      setImageError('이미지 파일만 선택할 수 있습니다.')
      return
    }
    setImageError(null)
    setCropFile(file)
    setCropTarget(target)
  }

  const cropPreset: ImageUploadPreset = cropTarget === 'cover' ? 'cover' : 'avatar'

  return (
    <>
      {open
        ? createPortal(
        <div
          className="fixed inset-0 z-[70] flex flex-col justify-end bg-slate-900/50 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          onClick={onClose}
          role="presentation"
        >
          <section
            aria-labelledby="profile-edit-title"
            aria-modal="true"
            className="flex max-h-[100dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_10px_25px_rgba(0,0,0,0.12)] sm:max-h-[min(92dvh,900px)] sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="relative shrink-0">
              <button
                aria-label="닫기"
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
                onClick={onClose}
                type="button"
              >
                <X size={18} />
              </button>

          <div className="relative mb-12 sm:mb-[60px]">
            <div
              className={cn(
                'relative flex h-28 w-full items-center justify-center transition hover:brightness-95 sm:h-40',
                !coverUrl && 'bg-slate-200',
              )}
              style={
                coverUrl
                  ? {
                      backgroundImage: `url(${coverUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : {
                      backgroundImage:
                        'linear-gradient(45deg, #e2e8f0 25%, #cbd5e1 25%, #cbd5e1 50%, #e2e8f0 50%, #e2e8f0 75%, #cbd5e1 75%, #cbd5e1 100%)',
                      backgroundSize: '20px 20px',
                    }
              }
            >
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  openCrop(event.target.files?.[0], 'cover')
                  event.target.value = ''
                }}
                ref={coverInputRef}
                type="file"
              />
              <button
                className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-2 text-[13px] font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
                onClick={() => coverInputRef.current?.click()}
                type="button"
              >
                <Camera size={16} />
                커버 변경
              </button>
            </div>

            <div className="absolute -bottom-10 left-5 sm:-bottom-[55px] sm:left-8">
              <div className="relative">
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    openCrop(event.target.files?.[0], 'avatar')
                    event.target.value = ''
                  }}
                  ref={avatarInputRef}
                  type="file"
                />
                {avatarUrl ? (
                  <img
                    alt={`${userName} 프로필`}
                    className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-md sm:h-[110px] sm:w-[110px]"
                    key={avatarUrl}
                    src={avatarUrl}
                  />
                ) : (
                  <Avatar className="!h-20 !w-20 !text-2xl sm:!h-[110px] sm:!w-[110px] sm:!text-3xl" name={userName} size="xl" />
                )}
                <button
                  className="absolute inset-0 m-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                  onClick={() => avatarInputRef.current?.click()}
                  type="button"
                >
                  <Camera size={18} />
                </button>
              </div>
            </div>
          </div>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()
                onSubmit()
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 sm:px-8 sm:pb-6 sm:pt-0">
            <div className="mb-5 sm:mb-6">
              <h2 className="text-lg font-bold text-slate-800 sm:text-xl" id="profile-edit-title">
                프로필 편집
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                기본 정보와 링크를 지정합니다. 기술스택은 쉼표로 구분합니다.
              </p>
            </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5">
                <Field label="직무 헤드라인">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ headline: event.target.value })}
                    placeholder="Software Engineer"
                    value={form.headline}
                  />
                </Field>
                <Field label="학교">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ school: event.target.value })}
                    placeholder="학교명을 입력하세요"
                    value={form.school}
                  />
                </Field>
                <Field label="소속">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ company: event.target.value })}
                    placeholder="회사 또는 소속"
                    value={form.company}
                  />
                </Field>
                <Field label="위치">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ location: event.target.value })}
                    placeholder="예: 서울, 대한민국"
                    value={form.location}
                  />
                </Field>
                <Field label="기술스택">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ skills: event.target.value })}
                    placeholder="React, TypeScript, PyTorch"
                    value={form.skills}
                  />
                </Field>
                <Field label="관심분야">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ interests: event.target.value })}
                    placeholder="관심있는 분야를 입력하세요"
                    value={form.interests}
                  />
                </Field>
                <Field label="웹사이트">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ website: event.target.value })}
                    placeholder="https://"
                    type="url"
                    value={form.website}
                  />
                </Field>
                <Field label="GitHub">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ github: event.target.value })}
                    placeholder="https://github.com/"
                    type="url"
                    value={form.github}
                  />
                </Field>
                <Field className="sm:col-span-2" label="LinkedIn">
                  <input
                    className={fieldClass}
                    onChange={(event) => onChange({ linkedin: event.target.value })}
                    placeholder="https://linkedin.com/in/"
                    type="url"
                    value={form.linkedin}
                  />
                </Field>
                <Field className="sm:col-span-2" label="소개">
                  <textarea
                    className={cn(fieldClass, 'min-h-20 resize-y')}
                    onChange={(event) => onChange({ bio: event.target.value })}
                    placeholder="자신을 자유롭게 소개해주세요."
                    value={form.bio}
                  />
                </Field>
              </div>

              {imageError ? (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {imageError}
                </p>
              ) : null}
              {errorMessage ? (
                <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              ) : null}
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-5">
                <button
                  className="min-h-11 w-full rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:ml-auto sm:block sm:w-auto"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? '저장 중…' : '저장'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )
        : null}

      <ImageCropDialog
        file={cropFile}
        onCancel={() => {
          setCropTarget(null)
          setCropFile(null)
        }}
        onConfirm={(dataUrl) => {
          if (cropTarget === 'avatar') {
            onAvatarChange(dataUrl)
          } else if (cropTarget === 'cover') {
            onCoverChange(dataUrl)
          }
          setCropTarget(null)
          setCropFile(null)
        }}
        open={cropTarget !== null && cropFile !== null}
        preset={cropPreset}
        title={cropTarget === 'cover' ? '배경 이미지 자르기' : '프로필 사진 자르기'}
      />
    </>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  )
}
