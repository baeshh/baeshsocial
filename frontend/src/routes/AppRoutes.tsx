import { Navigate, Route, Routes } from 'react-router-dom'
import { AICopilotPage } from '../pages/ai-copilot/AICopilotPage'
import { AuthEntryPage } from '../pages/auth/AuthEntryPage'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { LandingPage } from '../pages/LandingPage'
import { FindPage } from '../pages/find/FindPage'
import { NetworkPage } from '../pages/network/NetworkPage'
import { OpportunitiesPage } from '../pages/opportunities/OpportunitiesPage'
import { ProfilePage } from '../pages/profile/ProfilePage'
import { PublicProfilePage } from '../pages/profile/PublicProfilePage'
import { ProjectsPage } from '../pages/projects/ProjectsPage'
import { PublicPostPage } from '../pages/posts/PublicPostPage'
import { AdminOrganizationsPage } from '../pages/admin/AdminOrganizationsPage'
import { ProgramDetailPage } from '../pages/institution/ProgramDetailPage'
import { OrganizationDashboardPage } from '../pages/organizations/OrganizationDashboardPage'
import { OrganizationRegisterPage } from '../pages/organizations/OrganizationRegisterPage'
import { OrganizationsPage } from '../pages/organizations/OrganizationsPage'
import { RequireOrgMembership, RequirePlatformAdmin } from './guards'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<PublicPostPage />} path="/p/:postId" />
      <Route element={<PublicProfilePage />} path="/u/:userId" />
      <Route element={<AuthEntryPage />} path="/auth/:mode" />
      <Route element={<DashboardPage />} path="/dashboard" />
      <Route element={<ProfilePage />} path="/profile" />
      <Route element={<ProfilePage />} path="/profile/:userId" />
      <Route element={<ProjectsPage />} path="/projects" />
      <Route element={<ProjectsPage />} path="/projects/:projectId" />
      <Route element={<NetworkPage />} path="/network" />
      <Route element={<FindPage />} path="/find" />
      <Route element={<OpportunitiesPage />} path="/opportunities" />
      <Route element={<AICopilotPage />} path="/ai-copilot" />
      <Route
        element={
          <ComingSoonPage
            description="기업용 인재 검색, Trust Score 필터, AI Matching Result를 연결합니다."
            phase="Phase 9"
            title="Talent DB"
          />
        }
        path="/talent-db"
      />
      <Route element={<OrganizationsPage />} path="/organizations" />
      <Route element={<OrganizationRegisterPage />} path="/organizations/new" />
      <Route
        element={
          <RequireOrgMembership>
            <OrganizationDashboardPage />
          </RequireOrgMembership>
        }
        path="/org/:orgId"
      />
      <Route
        element={
          <RequireOrgMembership>
            <ProgramDetailPage />
          </RequireOrgMembership>
        }
        path="/org/:orgId/programs/:programId"
      />
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminOrganizationsPage />
          </RequirePlatformAdmin>
        }
        path="/admin/organizations"
      />
      <Route element={<Navigate replace to="/organizations" />} path="/institution-admin" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
