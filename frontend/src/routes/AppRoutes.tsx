import { Fragment, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AICopilotPage } from '../pages/ai-copilot/AICopilotPage'
import { AuthEntryPage } from '../pages/auth/AuthEntryPage'
import { LandingPage } from '../pages/LandingPage'
import { FindPage } from '../pages/find/FindPage'
import { HomePage } from '../pages/home/HomePage'
import { NetworkPage } from '../pages/network/NetworkPage'
import { OpportunitiesPage } from '../pages/opportunities/OpportunitiesPage'
import { OpportunityDetailPage } from '../pages/opportunities/OpportunityDetailPage'
import { ProfilePage } from '../pages/profile/ProfilePage'
import { PublicProfilePage } from '../pages/profile/PublicProfilePage'
import { ProjectsPage } from '../pages/projects/ProjectsPage'
import { PublicPostPage } from '../pages/posts/PublicPostPage'
import { AdminAIUsagePage } from '../pages/admin/AdminAIUsagePage'
import { AdminAuditPage } from '../pages/admin/AdminAuditPage'
import { AdminBillingPage } from '../pages/admin/AdminBillingPage'
import { AdminOpsPage } from '../pages/admin/AdminOpsPage'
import { AdminOrganizationsPage } from '../pages/admin/AdminOrganizationsPage'
import { AdminSupportPage } from '../pages/admin/AdminSupportPage'
import { AdminUsersPage } from '../pages/admin/AdminUsersPage'
import { InvitePage } from '../pages/invite/InvitePage'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { SupportPage } from '../pages/support/SupportPage'
import { TalentDBPage } from '../pages/talent-db/TalentDBPage'
import { ProgramDetailPage } from '../pages/institution/ProgramDetailPage'
import { ProgramWizardPage } from '../pages/institution/ProgramWizardPage'
import { ProgramPublicPage } from '../pages/programs/ProgramPublicPage'
import { OrganizationDashboardPage } from '../pages/organizations/OrganizationDashboardPage'
import { OrganizationRegisterPage } from '../pages/organizations/OrganizationRegisterPage'
import { OrganizationsPage } from '../pages/organizations/OrganizationsPage'
import { RequireOrgMembership, RequirePlatformAdmin, RequireProgramViewer } from './guards'

/**
 * React Router reuses the element when only a path param changes. Pages whose local state (forms, filters,
 * selections) belongs to one organization or program must start over instead of carrying it to the next one.
 */
function RemountOnParams({ params, children }: { params: string[]; children: ReactNode }) {
  const values = useParams()
  return <Fragment key={params.map((name) => values[name] ?? '').join('/')}>{children}</Fragment>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<PublicPostPage />} path="/p/:postId" />
      <Route element={<PublicProfilePage />} path="/u/:userId" />
      <Route element={<AuthEntryPage />} path="/auth/:mode" />
      <Route element={<InvitePage />} path="/invite/:token" />
      <Route element={<SettingsPage />} path="/settings" />
      <Route element={<SupportPage />} path="/support" />
      <Route element={<HomePage />} path="/dashboard" />
      <Route element={<Navigate replace to="/dashboard" />} path="/home" />
      <Route element={<ProfilePage />} path="/profile" />
      <Route
        element={
          <RemountOnParams params={['userId']}>
            <ProfilePage />
          </RemountOnParams>
        }
        path="/profile/:userId"
      />
      <Route element={<ProjectsPage />} path="/projects" />
      <Route element={<ProjectsPage />} path="/projects/:projectId" />
      <Route element={<NetworkPage />} path="/network" />
      <Route element={<FindPage />} path="/find" />
      <Route element={<OpportunitiesPage />} path="/opportunities" />
      <Route
        element={
          <RemountOnParams params={['opportunityId']}>
            <OpportunityDetailPage />
          </RemountOnParams>
        }
        path="/opportunities/:opportunityId"
      />
      <Route element={<ProgramPublicPage />} path="/programs/:programId" />
      <Route element={<AICopilotPage />} path="/ai-copilot" />
      <Route element={<TalentDBPage />} path="/talent-db" />
      <Route element={<OrganizationsPage />} path="/organizations" />
      <Route element={<OrganizationRegisterPage />} path="/organizations/new" />
      <Route
        element={
          <RemountOnParams params={['orgId']}>
            <RequireOrgMembership>
              <OrganizationDashboardPage />
            </RequireOrgMembership>
          </RemountOnParams>
        }
        path="/org/:orgId"
      />
      {/* Same element on both paths (keyed by org only) so a new draft keeps its state when the URL gains its id. */}
      {['/org/:orgId/programs/new', '/org/:orgId/programs/:programId/setup'].map((path) => (
        <Route
          element={
            <RemountOnParams params={['orgId']}>
              <RequireOrgMembership>
                <ProgramWizardPage />
              </RequireOrgMembership>
            </RemountOnParams>
          }
          key={path}
          path={path}
        />
      ))}
      <Route
        element={
          <RemountOnParams params={['orgId', 'programId']}>
            <RequireProgramViewer>
              <ProgramDetailPage />
            </RequireProgramViewer>
          </RemountOnParams>
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
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminAIUsagePage />
          </RequirePlatformAdmin>
        }
        path="/admin/ai"
      />
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminBillingPage />
          </RequirePlatformAdmin>
        }
        path="/admin/billing"
      />
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminOpsPage />
          </RequirePlatformAdmin>
        }
        path="/admin/ops"
      />
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminUsersPage />
          </RequirePlatformAdmin>
        }
        path="/admin/users"
      />
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminAuditPage />
          </RequirePlatformAdmin>
        }
        path="/admin/audit"
      />
      <Route
        element={
          <RequirePlatformAdmin>
            <AdminSupportPage />
          </RequirePlatformAdmin>
        }
        path="/admin/support"
      />
      <Route element={<Navigate replace to="/admin/ops" />} path="/admin" />
      <Route element={<Navigate replace to="/organizations" />} path="/institution-admin" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
