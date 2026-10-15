import { useParams } from 'react-router-dom'
import { AppLayout } from '../../components/layout/AppLayout'
import { ProjectDetailView } from '../../components/projects/detail/ProjectDetailView'
import { ProjectListView } from '../../components/projects/ProjectListView'
import { useAuthStore } from '../../stores/authStore'

export function ProjectsPage() {
  const { projectId } = useParams()
  const token = useAuthStore((state) => state.token) ?? ''

  return <AppLayout>{projectId ? <ProjectDetailView key={projectId} projectId={projectId} token={token} /> : <ProjectListView token={token} />}</AppLayout>
}
