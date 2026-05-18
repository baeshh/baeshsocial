import { AppLayout } from '../components/layout/AppLayout'
import { Badge } from '../components/common/Badge'
import { Card, CardDescription, CardHeader, CardTitle } from '../components/common/Card'
import { EmptyState } from '../components/common/EmptyState'

type ComingSoonPageProps = {
  title: string
  description: string
  phase: string
}

export function ComingSoonPage({ title, description, phase }: ComingSoonPageProps) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardHeader>
            <Badge tone="blue">{phase}</Badge>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <EmptyState
            description="현재 Phase에서는 디자인 시스템과 앱 구조만 연결했습니다. 다음 Phase에서 실제 API와 CRUD 화면을 순서대로 붙입니다."
            title="구현 준비 완료"
          />
        </Card>
      </div>
    </AppLayout>
  )
}
