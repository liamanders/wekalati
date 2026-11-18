import { cloneElement, createContext, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Coins, Copy, Download, Ellipsis, FileCheck2,
  KeyRound, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Upload, Users, UserRoundCog, Wallet, X,
} from 'lucide-react'
import { api, type ApiDelivery, type ApiMember, type ApiRole, type ApiUser } from './services/api'
import { translateText, type Locale } from './i18n'

type Role = 'Supervisor' | 'Admin' | 'User'
type Member = { id: number | string; agencyId?: string | null; role?: ApiRole; name: string; email: string; nickname: string; phone: string; shamcash: string; diamonds: number; deliveries: number; color: string }
type Agency = { id: number | string; name: string; initials: string; location: string; members: number; diamonds: number; admins: number; color: string; archivedAt?: string | null }
type Delivery = { id: number | string; diamonds: number; date: string; screenshot: string }

const LocaleContext = createContext<Locale>('en')

const usd = (diamonds: number) => `$${(diamonds / 100000 * 5).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const compact = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M` : value.toLocaleString()
const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()
const roleLabel = (role: ApiRole): Role => role === 'supervisor' ? 'Supervisor' : role === 'admin' ? 'Admin' : 'User'
const formatDelivery = (delivery: ApiDelivery): Delivery => ({
  id: delivery.id,
  diamonds: Number(delivery.diamonds),
  date: new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(delivery.deliveredAt)),
  screenshot: delivery.screenshotUrl,
})
const memberFromApi = (member: ApiMember, index: number): Member => ({
  ...member,
  diamonds: Number(member.diamonds),
  deliveries: member.deliveryCount,
  color: ['violet', 'blue', 'rose', 'amber', 'mint'][index % 5],
})

function App() {
  const [locale, setLocale] = useState<Locale>('ar')
  const [apiToken, setApiToken] = useState(() => sessionStorage.getItem('orbit-token'))
  const [apiUser, setApiUser] = useState<ApiUser | null>(() => {
    try {
      const savedUser = sessionStorage.getItem('orbit-user')
      return savedUser ? JSON.parse(savedUser) as ApiUser : null
    } catch {
      return null
    }
  })
  const role = apiUser ? roleLabel(apiUser.role) : null
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [memberHistory, setMemberHistory] = useState<Delivery[]>([])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [view, setView] = useState<'Overview' | 'Agencies' | 'Accounts' | 'Members' | 'My deliveries'>('Overview')
  const [modal, setModal] = useState<'agency' | 'agency-settings' | 'remove-admin' | 'member' | 'delivery' | 'login' | 'archive' | 'password' | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Agency | null>(null)
  const [agencyEditTarget, setAgencyEditTarget] = useState<Agency | null>(null)
  const [adminToRemove, setAdminToRemove] = useState<Member | null>(null)
  const [resetTarget, setResetTarget] = useState<Member | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [agencyName, setAgencyName] = useState('')
  const [agencyLocation, setAgencyLocation] = useState('')
  const [editAgencyName, setEditAgencyName] = useState('')
  const [editAgencyLocation, setEditAgencyLocation] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPhone, setNewAdminPhone] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPhone, setAdminPhone] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [memberNickname, setMemberNickname] = useState('')
  const [memberPassword, setMemberPassword] = useState('')
  const [diamondsInput, setDiamondsInput] = useState('')
  const [nickname, setNickname] = useState('')
  const [shamcash, setShamcash] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)

  const allDiamonds = agencies.reduce((sum, agency) => sum + agency.diamonds, 0)
  const agencyMembers = useMemo(() => members
    .filter((member) => member.role !== 'admin' && member.role !== 'supervisor')
    .filter((member) => role !== 'Supervisor' || !selectedAgency || String(member.agencyId) === String(selectedAgency.id)), [members, role, selectedAgency])
  const visibleMembers = useMemo(() => agencyMembers
    .filter((member) => `${member.name} ${member.nickname}`.toLowerCase().includes(search.toLowerCase())), [agencyMembers, search])
  const activeSection = role === 'User' ? 'My deliveries' : view
  const memberDiamonds = agencyMembers.reduce((sum, member) => sum + member.diamonds, 0)
  const accountAgency = agencies.find((agency) => String(agency.id) === apiUser?.agencyId)
  const editingAgencyAdmins = agencyEditTarget
    ? members.filter((member) => member.role === 'admin' && String(member.agencyId) === String(agencyEditTarget.id))
    : []

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  useEffect(() => {
    if (!apiToken || !apiUser) return
    let active = true
    setLoading(true)
    const loadWorkspace = async () => {
      try {
        const [agencyRows, userRows, deliveryRows] = await Promise.all([
          apiUser.role === 'user' ? Promise.resolve([]) : api.agencies(apiToken, apiUser.role === 'supervisor'),
          apiUser.role === 'user' ? Promise.resolve([]) : api.users(apiToken),
          apiUser.role === 'user' ? api.deliveries(apiToken) : Promise.resolve([]),
        ])
        if (!active) return
        setAgencies(agencyRows.map((agency, index) => ({
          id: agency.id,
          name: agency.name,
          initials: initials(agency.name),
          location: agency.location || 'Location not set',
          members: Number(agency.members),
          diamonds: Number(agency.diamonds),
          admins: Number(agency.admins),
          archivedAt: agency.archivedAt,
          color: ['violet', 'blue', 'mint', 'amber'][index % 4],
        })))
        setMembers(userRows.map(memberFromApi))
        if (apiUser.role === 'user') setDeliveries(deliveryRows.map(formatDelivery))
      } catch (error) {
        if (active) notify(error instanceof Error ? error.message : 'Unable to load your workspace')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadWorkspace()
    return () => { active = false }
  }, [apiToken, apiUser, refreshKey])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  async function connectAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      const session = await api.login(loginEmail, loginPassword)
      sessionStorage.setItem('orbit-token', session.token)
      sessionStorage.setItem('orbit-user', JSON.stringify(session.user))
      setAgencies([])
      setMembers([])
      setDeliveries([])
      setApiToken(session.token)
      setApiUser(session.user)
      setNickname(session.user.nickname)
      setShamcash(session.user.shamcash)
      setView(session.user.role === 'user' ? 'My deliveries' : 'Overview')
      setSelectedAgency(null)
      setModal(null)
      setLoginPassword('')
      notify(`Welcome, ${session.user.name}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  function signOut() {
    sessionStorage.removeItem('orbit-token')
    sessionStorage.removeItem('orbit-user')
    setApiToken(null)
    setApiUser(null)
    setAgencies([])
    setMembers([])
    setDeliveries([])
    setView('Overview')
    setSelectedAgency(null)
    setSelectedMember(null)
    setMenuOpen(false)
  }

  function openAgency(agency: Agency) {
    setSelectedAgency(agency)
    setSearch('')
    setView('Members')
  }

  function openAgencySettings(agency: Agency) {
    setAgencyEditTarget(agency)
    setEditAgencyName(agency.name)
    setEditAgencyLocation(agency.location === 'Location not set' ? '' : agency.location)
    setNewAdminName('')
    setNewAdminEmail('')
    setNewAdminPhone('')
    setNewAdminPassword('')
    setModal('agency-settings')
  }

  async function saveAgencyDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiToken || !agencyEditTarget) return
    const name = editAgencyName.trim()
    if (!name) {
      notify('Agency name is required')
      return
    }
    const location = editAgencyLocation.trim()
    setLoading(true)
    try {
      await api.updateAgency(apiToken, String(agencyEditTarget.id), { name, location })
      setRefreshKey((value) => value + 1)
      setAgencyEditTarget({ ...agencyEditTarget, name, initials: initials(name), location: location || 'Location not set' })
      notify('Agency details updated')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to update agency details')
    } finally {
      setLoading(false)
    }
  }

  async function addAgencyAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiToken || !agencyEditTarget) return
    const name = newAdminName.trim()
    const email = newAdminEmail.trim()
    if (!name || !email || newAdminPassword.length < 12) {
      notify('Admin name, email, and a password of at least 12 characters are required')
      return
    }
    setLoading(true)
    try {
      await api.createUser(apiToken, {
        name,
        email,
        password: newAdminPassword,
        phone: newAdminPhone.trim(),
        nickname: '',
        agencyId: String(agencyEditTarget.id),
        role: 'admin',
      })
      setRefreshKey((value) => value + 1)
      setNewAdminName('')
      setNewAdminEmail('')
      setNewAdminPhone('')
      setNewAdminPassword('')
      notify('Agency admin added')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to add this admin')
    } finally {
      setLoading(false)
    }
  }

  async function confirmRemoveAdmin() {
    if (!apiToken || !agencyEditTarget || !adminToRemove) return
    setLoading(true)
    try {
      await api.deleteUser(apiToken, String(adminToRemove.id))
      setRefreshKey((value) => value + 1)
      setAdminToRemove(null)
      setModal('agency-settings')
      notify('Agency admin removed')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to remove this admin')
    } finally {
      setLoading(false)
    }
  }

  async function addAgency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = agencyName.trim()
    if (!apiToken || !name || !adminName.trim() || !adminEmail.trim() || adminPassword.length < 12) return
    try {
      await api.createAgency(apiToken, {
        name,
        location: agencyLocation.trim(),
        admin: { name: adminName.trim(), email: adminEmail.trim(), phone: adminPhone.trim(), password: adminPassword },
      })
      setRefreshKey((value) => value + 1)
      setAgencyName('')
      setAgencyLocation('')
      setAdminName('')
      setAdminEmail('')
      setAdminPhone('')
      setAdminPassword('')
      setModal(null)
      notify('Agency and assigned admin created successfully')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to create the agency')
    }
  }

  async function confirmArchiveAgency() {
    if (!apiToken || !archiveTarget) return
    setLoading(true)
    try {
      await api.archiveAgency(apiToken, String(archiveTarget.id))
      setRefreshKey((value) => value + 1)
      setModal(null)
      setArchiveTarget(null)
      notify('Agency moved to past agencies')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to archive this agency')
    } finally {
      setLoading(false)
    }
  }

  async function resetAccountPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiToken || !resetTarget) return
    if (newPassword.length < 12) {
      notify('Password must be at least 12 characters')
      return
    }
    if (newPassword !== passwordConfirmation) {
      notify('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await api.resetPassword(apiToken, String(resetTarget.id), newPassword)
      setModal(null)
      setResetTarget(null)
      setNewPassword('')
      setPasswordConfirmation('')
      notify('Password reset; previous sessions are signed out')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to reset this password')
    } finally {
      setLoading(false)
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = memberName.trim()
    if (!apiToken || !name || !memberEmail.trim() || !memberPassword) return
    try {
      await api.createUser(apiToken, {
        name,
        email: memberEmail.trim(),
        password: memberPassword,
        phone: memberPhone.trim(),
        nickname: memberNickname.trim() || `@${name.toLowerCase().replace(/\s+/g, '.')}`,
        ...(role === 'Supervisor' && selectedAgency ? { agencyId: String(selectedAgency.id) } : {}),
      })
      setRefreshKey((value) => value + 1)
      setMemberName('')
      setMemberEmail('')
      setMemberPhone('')
      setMemberNickname('')
      setMemberPassword('')
      setModal(null)
      notify('User added to this agency')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to create this user')
    }
  }

  async function submitDelivery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiToken) return
    const amount = Number(diamondsInput.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Enter a valid diamond amount')
      return
    }
    if (!file) {
      notify('Please attach a screenshot to confirm your delivery')
      return
    }
    try {
      await api.createDelivery(apiToken, amount, file)
      setRefreshKey((value) => value + 1)
      setDiamondsInput('')
      setFile(null)
      setModal(null)
      notify('Delivery submitted successfully')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to submit the delivery')
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!apiToken || !apiUser) return
    try {
      const updated = await api.updateUser(apiToken, apiUser.id, { nickname, shamcash })
      const nextUser = { ...apiUser, nickname: updated.nickname, shamcash: updated.shamcash }
      setApiUser(nextUser)
      sessionStorage.setItem('orbit-user', JSON.stringify(nextUser))
      setRefreshKey((value) => value + 1)
      setModal(null)
      notify('Your profile has been updated')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to update your profile')
    }
  }

  async function showMember(member: Member) {
    setSelectedMember(member)
    if (!apiToken || typeof member.id !== 'string') {
      setMemberHistory([])
      return
    }
    try {
      setMemberHistory((await api.userDeliveries(apiToken, member.id)).map(formatDelivery))
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to load delivery history')
    }
  }

  const nav = !apiToken || !apiUser
    ? []
    : role === 'User'
    ? [{ label: 'My deliveries', icon: LayoutDashboard }]
    : role === 'Supervisor'
      ? [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Agencies', icon: Users }, { label: 'Accounts', icon: UserRoundCog }]
      : [{ label: 'Overview', icon: LayoutDashboard }, { label: 'Members', icon: Users }]

  const appTree = (
    <div className="app-shell" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Sparkles size={18} fill="currentColor" /></div><span>Wekalati<span className="brand-dot">.</span></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch" onClick={() => notify('You are viewing the Wekalati workspace')}><div className="workspace-icon">W</div><span><strong>Wekalati workspace</strong><small>Agency management</small></span><ChevronDown size={15} /></button>
        <div className="nav-label">MENU</div>
        <nav className="main-nav">
          {nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeSection === label || (label === 'Overview' && view === 'Members' && role === 'Admin') ? 'active' : ''}`} onClick={() => { setView(label as typeof view); setSelectedAgency(null); setSelectedMember(null); setMobileNav(false) }}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Agencies' && <span className="nav-count">{agencies.filter((agency) => !agency.archivedAt).length}</span>}</button>)}
        </nav>
        {role === 'Admin' && <div className="agency-mini"><span className="nav-label">YOUR AGENCY</span><button className="agency-switch" onClick={() => notify(accountAgency?.name || 'Agency not assigned')}><span className="agency-dot violet-bg">{initials(accountAgency?.name || 'Agency').slice(0, 1)}</span><span>{accountAgency?.name || 'Agency not assigned'}</span><ChevronDown size={14} /></button></div>}
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => notify('Help center coming soon')}><CircleHelp size={18} /><span>Help center</span></button>
          {apiUser && <button className="profile-card" onClick={() => setMenuOpen((open) => !open)}><div className="avatar avatar-dark">{initials(apiUser.name)}</div><span className="profile-copy"><strong>{apiUser.name}</strong><small>{role}</small></span><Ellipsis size={18} /></button>}
          {menuOpen && apiUser && <div className="role-menu"><button onClick={signOut}><LogOut size={14} /> Sign out</button></div>}
        </div>
      </aside>
      {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{selectedMember ? selectedMember.name : selectedAgency && view === 'Members' ? selectedAgency.name : activeSection}</strong></div>
          <div className="topbar-actions"><button className="button button-outline language-toggle" onClick={() => setLocale((value) => value === 'ar' ? 'en' : 'ar')} aria-label="Switch language">{locale === 'ar' ? 'English' : 'العربية'}</button>{(!apiToken || !apiUser) ? <button className="button button-outline connect-button" onClick={() => setModal('login')}>Sign in</button> : <><div className="role-badge"><span />{role}</div><button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify('You’re all caught up')}><Bell size={18} /><i /></button><div className="top-divider" /><button className="top-avatar" onClick={() => setMenuOpen((open) => !open)}>{initials(apiUser.name)}</button></>}</div>
        </header>

        <div className="page-content">
          {(!apiToken || !apiUser) ? (
            <SignInPrompt onSignIn={() => setModal('login')} />
          ) : role === 'User' ? (
            <UserDashboard deliveries={deliveries} nickname={nickname || apiUser.name} shamcash={shamcash} onDelivery={() => { setFile(null); setModal('delivery') }} onEdit={() => { setNickname(apiUser.nickname); setShamcash(apiUser.shamcash); setModal('member') }} />
          ) : selectedMember ? (
            <MemberDetails member={selectedMember} history={memberHistory} onBack={() => setSelectedMember(null)} />
          ) : view === 'Members' && role === 'Admin' ? (
            <MembersPage members={visibleMembers} query={search} setQuery={setSearch} total={memberDiamonds} onAdd={() => setModal('member')} onMember={showMember} />
          ) : view === 'Members' && selectedAgency ? (
            <MembersPage members={visibleMembers} query={search} setQuery={setSearch} total={memberDiamonds} onAdd={() => setModal('member')} onMember={showMember} agency={selectedAgency.name} onBack={() => { setSelectedAgency(null); setView('Agencies') }} allowAdd={!selectedAgency.archivedAt} />
          ) : role === 'Supervisor' && view === 'Accounts' ? (
            <SupervisorAccounts members={members} agencies={agencies} onReset={(member) => { setResetTarget(member); setNewPassword(''); setPasswordConfirmation(''); setModal('password') }} />
          ) : role === 'Supervisor' ? (
            <SupervisorDashboard agencies={agencies} totalDiamonds={allDiamonds} supervisorName={apiUser?.name || ''} onAdd={() => setModal('agency')} onAgency={openAgency} onEdit={openAgencySettings} onArchive={(agency) => { setArchiveTarget(agency); setModal('archive') }} view={view} />
          ) : (
            <AdminDashboard members={visibleMembers} total={memberDiamonds} onAdd={() => setModal('member')} onMember={showMember} query={search} setQuery={setSearch} agencyName={accountAgency?.name} />
          )}
        </div>
      </main>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}><div className={`modal ${modal === 'delivery' ? 'delivery-modal' : ''} ${modal === 'agency-settings' ? 'agency-settings-modal' : ''}`} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><X size={18} /></button>
        {modal === 'login' && <><div className="modal-icon lavender"><ShieldCheck size={20} /></div><h2>Sign in to Wekalati</h2><p className="modal-subtitle">Use the account created for you by your supervisor or agency admin.</p><form onSubmit={connectAccount}><label>Email</label><input type="email" autoFocus autoComplete="username" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@agency.com" required /><label>Password</label><input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Your password" required /><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></div></form></>}
        {modal === 'agency' && <><div className="modal-icon lavender"><Users size={20} /></div><h2>Create an agency</h2><p className="modal-subtitle">Create its admin account at the same time. The admin will only manage this agency.</p><form onSubmit={addAgency}><label>Agency name</label><input autoFocus value={agencyName} onChange={(event) => setAgencyName(event.target.value)} placeholder="e.g. Studio North" required /><label>Agency location <span className="optional">Optional</span></label><input value={agencyLocation} onChange={(event) => setAgencyLocation(event.target.value)} placeholder="City, country" /><div className="form-section-label">AGENCY ADMIN</div><label>Admin full name</label><input value={adminName} onChange={(event) => setAdminName(event.target.value)} placeholder="e.g. Samira Noor" required /><label>Admin email</label><input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@example.com" required /><label>Admin phone <span className="optional">Optional</span></label><input value={adminPhone} onChange={(event) => setAdminPhone(event.target.value)} placeholder="+964 7XX XXX XXXX" /><label>Temporary password</label><input type="password" minLength={12} value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="At least 12 characters" required /><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={loading}><Plus size={16} /> Create agency & admin</button></div></form></>}
        {modal === 'agency-settings' && agencyEditTarget && role === 'Supervisor' && <><div className="modal-icon lavender"><Settings2 size={20} /></div><h2>Manage agency</h2><p className="modal-subtitle">Update agency details and manage its admin accounts.</p><form onSubmit={saveAgencyDetails}><label>Agency name</label><input autoFocus value={editAgencyName} onChange={(event) => setEditAgencyName(event.target.value)} required /><label>Agency location <span className="optional">Optional</span></label><input value={editAgencyLocation} onChange={(event) => setEditAgencyLocation(event.target.value)} placeholder="City, country" /><div className="modal-actions"><button className="button button-primary" disabled={loading}><Check size={16} /> Save agency details</button></div></form><div className="form-section-label">AGENCY ADMINS <span className="admin-count">{editingAgencyAdmins.length}</span></div><div className="agency-admin-list">{editingAgencyAdmins.map((admin) => <div className="agency-admin-row" key={admin.id}><div><strong>{admin.name}</strong><small>{admin.email}</small></div><button type="button" className="admin-remove" aria-label="Remove admin" title="Remove admin" onClick={() => { setAdminToRemove(admin); setModal('remove-admin') }}><Trash2 size={16} /></button></div>)}{editingAgencyAdmins.length === 0 && <p className="admin-empty">No administrators assigned.</p>}</div><div className="form-section-label">ADD AN ADMIN</div><form onSubmit={addAgencyAdmin}><label>Admin full name</label><input value={newAdminName} onChange={(event) => setNewAdminName(event.target.value)} placeholder="e.g. Samira Noor" required /><label>Admin email</label><input type="email" value={newAdminEmail} onChange={(event) => setNewAdminEmail(event.target.value)} placeholder="admin@example.com" required /><label>Admin phone <span className="optional">Optional</span></label><input value={newAdminPhone} onChange={(event) => setNewAdminPhone(event.target.value)} placeholder="+964 7XX XXX XXXX" /><label>Temporary password</label><input type="password" minLength={12} value={newAdminPassword} onChange={(event) => setNewAdminPassword(event.target.value)} placeholder="At least 12 characters" required /><div className="modal-actions"><button type="submit" className="button button-primary" disabled={loading}><Plus size={16} /> Add admin</button></div></form></>}
        {modal === 'remove-admin' && adminToRemove && agencyEditTarget && <><div className="modal-icon amber-soft"><Trash2 size={20} /></div><h2>Remove agency admin?</h2><p className="modal-subtitle"><strong>{adminToRemove.name}</strong> will be removed from <strong>{agencyEditTarget.name}</strong>.<br />This permanently deletes the account and revokes access.</p><div className="modal-actions"><button type="button" className="button button-outline" disabled={loading} onClick={() => { setAdminToRemove(null); setModal('agency-settings') }}>Cancel</button><button type="button" className="button button-primary button-danger" disabled={loading} onClick={() => void confirmRemoveAdmin()}><Trash2 size={16} /> Remove admin</button></div></>}
        {modal === 'member' && role !== 'User' && <><div className="modal-icon blue-soft"><Users size={20} /></div><h2>Add a team member</h2><p className="modal-subtitle">They'll be added to {selectedAgency?.name || accountAgency?.name || 'your agency'}.</p><form onSubmit={addMember}><label>Full name</label><input autoFocus value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="e.g. Samira Noor" required /><label>Login email</label><input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="name@example.com" required /><label>Phone number</label><input value={memberPhone} onChange={(event) => setMemberPhone(event.target.value)} placeholder="+964 7XX XXX XXXX" /><label>Nickname</label><input value={memberNickname} onChange={(event) => setMemberNickname(event.target.value)} placeholder="@username" /><label>Temporary password</label><input type="password" minLength={12} value={memberPassword} onChange={(event) => setMemberPassword(event.target.value)} placeholder="At least 12 characters" required /><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={loading}><Plus size={16} /> Add user</button></div></form></>}
        {modal === 'member' && role === 'User' && <><div className="modal-icon lavender"><Settings2 size={20} /></div><h2>Edit your profile</h2><p className="modal-subtitle">Update your nickname and ShamCash number.</p><form onSubmit={saveProfile}><label>Nickname</label><input value={nickname} onChange={(event) => setNickname(event.target.value)} required /><label>ShamCash number</label><input value={shamcash} onChange={(event) => setShamcash(event.target.value)} placeholder="Your ShamCash number" required /><p className="field-note"><ShieldCheck size={14} /> Your full name and phone number are managed by your agency admin.</p><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary">Save changes</button></div></form></>}
        {modal === 'delivery' && <><div className="modal-icon lavender"><Coins size={20} /></div><h2>Make a delivery</h2><p className="modal-subtitle">Enter the diamonds you delivered and attach a confirmation screenshot.</p><form onSubmit={submitDelivery}><label>Diamond amount</label><div className="amount-input"><input autoFocus value={diamondsInput} onChange={(event) => setDiamondsInput(event.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 250000" inputMode="numeric" required /><span>diamonds</span></div><div className="estimate"><span>Estimated value</span><strong>{diamondsInput ? usd(Number(diamondsInput)) : '$0.00'}</strong><small>at $5 per 100,000 diamonds</small></div><label>Delivery screenshot <span className="required">Required</span></label><input ref={uploadRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const selected = event.target.files?.[0]; if (!selected) return setFile(null); if (selected.size > 4 * 1024 * 1024) { setFile(null); notify('Screenshot must be 4 MB or smaller'); return } if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)) { setFile(null); notify('Screenshot must be a PNG, JPEG, or WEBP image'); return } setFile(selected) }} /><button type="button" className={`upload-box ${file ? 'upload-ready' : ''}`} onClick={() => uploadRef.current?.click()}><span className="upload-icon">{file ? <FileCheck2 size={19} /> : <Upload size={19} />}</span><strong>{file ? file.name : 'Click to upload a screenshot'}</strong><small>{file ? 'Screenshot attached and ready' : 'PNG, JPG or WEBP · Max 4 MB'}</small></button><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={!file || !diamondsInput}><Check size={16} /> Submit delivery</button></div></form></>}
        {modal === 'archive' && archiveTarget && <><div className="modal-icon amber-soft"><Trash2 size={20} /></div><h2>Move agency to past agencies?</h2><p className="modal-subtitle"><strong>{archiveTarget.name}</strong><br />Agency accounts and delivery records will be retained as history. Accounts from archived agencies cannot sign in.</p><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => { setModal(null); setArchiveTarget(null) }}>Cancel</button><button type="button" className="button button-primary button-danger" disabled={loading} onClick={() => void confirmArchiveAgency()}><Trash2 size={16} /> Move to history</button></div></>}
        {modal === 'password' && resetTarget && <><div className="modal-icon lavender"><KeyRound size={20} /></div><h2>Reset account password</h2><p className="modal-subtitle">Set a new password for <strong>{resetTarget.name}</strong>.<br />Any existing sessions will be signed out.</p><form onSubmit={resetAccountPassword}><label>New password</label><input type="password" autoFocus autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" required /><label>Confirm new password</label><input type="password" autoComplete="new-password" minLength={12} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="Enter the new password again" required /><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => { setModal(null); setResetTarget(null) }}>Cancel</button><button className="button button-primary" disabled={loading}><KeyRound size={16} /> Reset password</button></div></form></>}
      </div></div>}
      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}</div>}
    </div>
  )
  return <LocaleContext.Provider value={locale}><Translate>{appTree}</Translate></LocaleContext.Provider>
}

function translateNode(node: ReactNode, locale: Locale): ReactNode {
  if (locale === 'en' || node == null || typeof node === 'boolean' || typeof node === 'number') return node
  if (typeof node === 'string') return translateText(node, locale)
  if (Array.isArray(node)) return node.map((child) => translateNode(child, locale))
  if (!isValidElement<{ children?: ReactNode; placeholder?: string; title?: string; 'aria-label'?: string }>(node)) return node

  const props = { ...node.props }
  for (const key of ['placeholder', 'title', 'aria-label'] as const) {
    if (typeof props[key] === 'string') props[key] = translateText(props[key], locale)
  }
  if (props.children !== undefined) props.children = translateNode(props.children, locale)
  return cloneElement(node, props)
}

function Translate({ children }: { children: ReactNode }) {
  const locale = useContext(LocaleContext)
  return translateNode(children, locale)
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <Translate><div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{action}</div></Translate>
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }: { label: string; value: string; detail: string; icon: typeof Users; tone: string; trend?: string }) {
  return <Translate><div className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={18} /></div></div><div className="metric-value">{value}</div><div className="metric-detail">{trend && <span className="trend"><ArrowUpRight size={13} />{trend}</span>}{detail}</div></div></Translate>
}

function SupervisorDashboard({ agencies, totalDiamonds, supervisorName, onAdd, onAgency, onEdit, onArchive, view }: { agencies: Agency[]; totalDiamonds: number; supervisorName: string; onAdd: () => void; onAgency: (agency: Agency) => void; onEdit: (agency: Agency) => void; onArchive: (agency: Agency) => void; view: string }) {
  const isAgencyView = view === 'Agencies'
  const activeAgencies = agencies.filter((agency) => !agency.archivedAt)
  const pastAgencies = agencies.filter((agency) => Boolean(agency.archivedAt))
  const totalCreators = agencies.reduce((sum, agency) => sum + agency.members, 0)
  const renderAgency = (agency: Agency, index: number) => <div
    className={`agency-card ${agency.archivedAt ? 'agency-card-archived' : ''}`}
    key={agency.id}
    role="button"
    tabIndex={0}
    onClick={() => onAgency(agency)}
    onKeyDown={(event) => {
      if (event.target instanceof Element && event.target.closest('button')) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onAgency(agency)
      }
    }}
  >
    <div className="agency-card-top"><div className={`agency-logo ${agency.color}`}>{agency.initials}</div>{agency.archivedAt
      ? <span className="agency-status">Past agency</span>
      : <div className="agency-card-actions"><button className="agency-edit" type="button" aria-label="Edit agency" title="Edit agency" onClick={(event) => { event.stopPropagation(); onEdit(agency) }}><Settings2 size={17} /></button><button className="agency-delete" type="button" aria-label="Delete agency" title="Move agency to past agencies" onClick={(event) => { event.stopPropagation(); onArchive(agency) }}><Trash2 size={17} /></button></div>}</div>
    <h3>{agency.name}</h3>
    <div className="agency-location"><span className={`online-dot ${agency.archivedAt ? 'offline-dot' : ''}`} />{agency.location}</div>
    <div className="agency-stats"><div><strong>{compact(agency.diamonds)}</strong><span>diamonds</span></div><div><strong>{agency.members}</strong><span>creators</span></div></div>
    <div className="agency-card-foot"><div className="avatar-stack"><span className="tiny-avatar tiny-violet">{['L', 'N', 'A', 'S'][index % 4]}</span><span className="tiny-avatar tiny-blue">{['M', 'R', 'H', 'D'][index % 4]}</span><span className="tiny-avatar tiny-rose">+{agency.admins}</span></div><span className="view-agency">View agency <ArrowRight size={14} /></span></div>
  </div>
  return <Translate><>
    <PageHeading eyebrow="AGENCY WORKSPACE" title={isAgencyView ? 'Your agencies' : `Good morning, ${supervisorName}`} description={isAgencyView ? 'Manage every agency and the people behind it.' : 'Here’s what’s happening across your workspace today.'} action={<button className="button button-primary" onClick={onAdd}><Plus size={17} /> New agency</button>} />
    {!isAgencyView && <div className="metrics-grid"><MetricCard label="Total diamonds" value={compact(totalDiamonds)} detail="across all agencies" icon={Coins} tone="violet-tone" /><MetricCard label="Active agencies" value={String(activeAgencies.length).padStart(2, '0')} detail="all agencies running" icon={LayoutDashboard} tone="blue-tone" /><MetricCard label="Total creators" value={totalCreators.toLocaleString()} detail="across all agencies" icon={Users} tone="mint-tone" /><MetricCard label="Payout value" value={usd(totalDiamonds)} detail="at current delivery rate" icon={Wallet} tone="amber-tone" /></div>}
    <div className="section-heading"><div><h2>{isAgencyView ? 'All agencies' : 'Your agencies'}</h2><span className="section-count">{activeAgencies.length}</span></div><button className="text-button" onClick={onAdd}>Add agency <Plus size={15} /></button></div>
    <div className="agency-grid">{activeAgencies.map(renderAgency)}
      {!activeAgencies.length && <div className="empty-state"><strong>No active agencies</strong><span>Create an agency to get started.</span></div>}
      <button className="agency-add-card" onClick={onAdd}><span className="add-circle"><Plus size={19} /></span><strong>Create a new agency</strong><span>Bring your next team into Wekalati</span></button>
    </div>
    {!!pastAgencies.length && <><div className="section-heading past-agencies-heading"><div><h2>Past agencies</h2><span className="section-count">{pastAgencies.length}</span></div></div><div className="agency-grid">{pastAgencies.map(renderAgency)}</div></>}
    <div className="bottom-note"><div className="note-icon"><Sparkles size={16} /></div><span><strong>A little more room to grow.</strong> Your workspace is looking good. Keep up the momentum.</span><button onClick={() => {}}>Explore insights <ArrowRight size={14} /></button></div>
  </></Translate>
}

function SupervisorAccounts({ members, agencies, onReset }: { members: Member[]; agencies: Agency[]; onReset: (member: Member) => void }) {
  const accounts = members.filter((member) => member.role === 'admin' || member.role === 'user')
  return <Translate><div className="member-section">
    <PageHeading eyebrow="SUPERVISOR TOOLS" title="Account security" description="Reset passwords for agency admins and users. Existing sessions are revoked after a reset." />
    <div className="table-section">
      <div className="table-heading"><div><h2>Admins and users</h2><span className="muted-count">{accounts.length} accounts</span></div></div>
      <div className="table-scroll"><table className="accounts-table"><thead><tr><th>ACCOUNT</th><th>ROLE</th><th>AGENCY</th><th>STATUS</th><th /></tr></thead><tbody>
        {accounts.map((member) => {
          const agency = agencies.find((item) => String(item.id) === String(member.agencyId))
          const archived = !agency || Boolean(agency.archivedAt)
          return <tr key={member.id}>
            <td><div className="creator-cell"><span className={`avatar avatar-${member.color}`}>{initials(member.name)}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div></td>
            <td>{member.role === 'admin' ? 'Admin' : 'User'}</td>
            <td>{agency?.name || 'Unassigned'}</td>
            <td><span className={`account-status ${archived ? 'account-status-archived' : ''}`}>{archived ? 'Archived' : 'Active'}</span></td>
            <td>{archived ? <span className="muted-count">Unavailable</span> : <button className="button button-outline account-reset" aria-label="Reset password" title="Reset password" onClick={() => onReset(member)}><KeyRound size={15} /><span>Reset</span></button>}</td>
          </tr>
        })}
      </tbody></table>
      {!accounts.length && <div className="empty-state"><Users size={20} /><strong>No accounts found</strong><span>Agency admins and users will appear here.</span></div>}</div>
    </div>
  </div></Translate>
}

function AdminDashboard({ members, total, onAdd, onMember, query, setQuery, agencyName }: { members: Member[]; total: number; onAdd: () => void; onMember: (member: Member) => void; query: string; setQuery: (value: string) => void; agencyName?: string }) {
  return <Translate><><PageHeading eyebrow={agencyName ? `${agencyName} · YOUR AGENCY` : 'YOUR AGENCY'} title="Creator overview" description="Manage creators and delivery activity for your agency." action={<button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add user</button>} /><div className="metrics-grid admin-metrics"><MetricCard label="Diamonds delivered" value={compact(total)} detail="by all creators" icon={Coins} tone="violet-tone" /><MetricCard label="Total payout" value={usd(total)} detail="all time" icon={Wallet} tone="mint-tone" /><MetricCard label="Active creators" value={String(members.length)} detail="in your agency" icon={Users} tone="blue-tone" /></div><MembersPage members={members} total={total} onAdd={onAdd} onMember={onMember} query={query} setQuery={setQuery} compact /></></Translate>
}

function MembersPage({ members, query, setQuery, total, onAdd, onMember, agency, onBack, compact: compactView, allowAdd = true }: { members: Member[]; query: string; setQuery: (value: string) => void; total: number; onAdd: () => void; onMember: (member: Member) => void; agency?: string; onBack?: () => void; compact?: boolean; allowAdd?: boolean }) {
  return <Translate><div className={compactView ? 'member-section compact-members' : 'member-section'}>
    {!compactView && <PageHeading eyebrow={agency || 'YOUR AGENCY'} title={agency ? 'Agency members' : 'Your creators'} description="See creator activity, deliveries, and payout details." action={allowAdd ? <button className="button button-primary" onClick={onAdd}><Plus size={17} /> Add user</button> : undefined} />}
    {agency && onBack && <button className="back-button" onClick={onBack}><ArrowLeft size={15} /> All agencies</button>}
    <div className="member-summary"><div className="summary-intro"><div className="summary-icon"><Coins size={19} /></div><div><span>Total diamonds delivered</span><strong>{total.toLocaleString()} <small>diamonds</small></strong></div></div><div className="summary-divider" /><div className="summary-payout"><span>Total payout value</span><strong>{usd(total)}</strong><small>Calculated at $5 / 100K diamonds</small></div><div className="summary-period"><span className="period-dot" /> All time</div></div>
    <div className="table-section"><div className="table-heading"><div><h2>Creators</h2><span className="muted-count">{members.length} members</span></div><div className="table-actions"><label className="search-field"><Search size={16} /><input placeholder="Search creators..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="icon-button filter-button" aria-label="Filter creators" onClick={() => setQuery('')}><Settings2 size={17} /></button></div></div>
      <div className="table-scroll"><table><thead><tr><th>CREATOR</th><th>DELIVERIES</th><th>DIAMONDS DELIVERED</th><th>PAYOUT VALUE</th><th /></tr></thead><tbody>{members.map((member) => <tr key={member.id} onClick={() => onMember(member)}><td><div className="creator-cell"><span className={`avatar avatar-${member.color}`}>{initials(member.name)}</span><span><strong>{member.name}</strong><small>{member.nickname}</small></span></div></td><td><span className="delivery-count"><FileCheck2 size={14} />{member.deliveries} deliveries</span></td><td><strong className="table-number">{member.diamonds.toLocaleString()}</strong></td><td><strong className="payout-number">{usd(member.diamonds)}</strong></td><td><ChevronRight size={16} className="row-chevron" /></td></tr>)}</tbody></table>{members.length === 0 && <div className="empty-state"><Search size={20} /><strong>No creators found</strong><span>Try a different search.</span></div>}</div>
      <div className="table-footer"><span>Showing <strong>{members.length}</strong> of <strong>{members.length}</strong> creators</span><div><button disabled><ArrowLeft size={14} /></button><button className="page-current">1</button><button disabled><ArrowRight size={14} /></button></div></div>
    </div>
  </div></Translate>
}

function SignInPrompt({ onSignIn }: { onSignIn: () => void }) {
  return <Translate><div className="empty-state"><ShieldCheck size={22} /><strong>Sign in to continue</strong><span>Your agency workspace and delivery history will appear here after you sign in.</span><button className="button button-primary" onClick={onSignIn}>Sign in</button></div></Translate>
}

function MemberDetails({ member, history: apiHistory, onBack }: { member: Member; history: Delivery[]; onBack: () => void }) {
  const history = apiHistory.map((item) => ({ ...item, status: 'Submitted' }))
  return <Translate><><button className="back-button" onClick={onBack}><ArrowLeft size={15} /> Back to creators</button><PageHeading eyebrow="CREATOR PROFILE" title={member.name} description={`${member.nickname} · ${member.email}`} action={<button className="button button-outline" onClick={() => navigator.clipboard?.writeText(member.phone)}><Copy size={15} /> Copy details</button>} /><div className="detail-profile"><div className={`avatar detail-avatar avatar-${member.color}`}>{initials(member.name)}</div><div className="detail-identity"><h2>{member.name}</h2><span>{member.nickname}</span></div><span className="status-pill"><span /> Active creator</span><div className="detail-contact"><span><small>PHONE NUMBER</small><strong>{member.phone}</strong></span><span><small>SHAMCASH ACCOUNT</small><strong>{member.shamcash}</strong></span></div></div><div className="metrics-grid detail-metrics"><MetricCard label="Diamonds delivered" value={member.diamonds.toLocaleString()} detail="all time" icon={Coins} tone="violet-tone" /><MetricCard label="Payout value" value={usd(member.diamonds)} detail="total earned" icon={Wallet} tone="mint-tone" /><MetricCard label="Total deliveries" value={String(member.deliveries)} detail="confirmed deliveries" icon={FileCheck2} tone="blue-tone" /></div><div className="table-section history-table"><div className="table-heading"><div><h2>Delivery history</h2><span className="muted-count">All submitted deliveries</span></div><button className="button button-outline small-button"><Download size={15} /> Export</button></div><div className="table-scroll"><table><thead><tr><th>DELIVERY DATE</th><th>DIAMONDS</th><th>PAYOUT VALUE</th><th>STATUS</th></tr></thead><tbody>{history.map((item, index) => <tr key={index}><td><span className="date-cell"><span className="date-icon"><Clock3 size={15} /></span>{item.date}</span></td><td><strong className="table-number">{item.diamonds.toLocaleString()}</strong></td><td><strong className="payout-number">{usd(item.diamonds)}</strong></td><td><span className="confirmed-pill"><Check size={12} />{item.status}</span></td></tr>)}</tbody></table>{history.length === 0 && <div className="empty-state"><FileCheck2 size={20} /><strong>No deliveries yet</strong><span>This creator’s deliveries will show here.</span></div>}</div></div></></Translate>
}

function UserDashboard({ deliveries, nickname, shamcash, onDelivery, onEdit }: { deliveries: Delivery[]; nickname: string; shamcash: string; onDelivery: () => void; onEdit: () => void }) {
  const total = deliveries.reduce((sum, item) => sum + item.diamonds, 0)
  return <Translate><><PageHeading eyebrow="YOUR CREATOR SPACE" title={`Hey, ${nickname.replace('@', '').split('.')[0]} 👋`} description="Keep track of your deliveries and earnings, all in one place." action={<button className="button button-primary" onClick={onDelivery}><Plus size={17} /> Make a delivery</button>} /><div className="user-welcome"><div className="welcome-copy"><span className="welcome-kicker"><Sparkles size={14} /> YOUR PROGRESS</span><h2>Every delivery<br />takes you <em>further.</em></h2><p>You’re doing great. Here’s where you stand so far.</p><div className="welcome-stats"><div><span>Total diamonds</span><strong>{total.toLocaleString()}</strong></div><span className="welcome-divider" /><div><span>Your earnings</span><strong>{usd(total)}</strong></div></div></div><div className="welcome-art"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><Coins size={36} /></div><span className="float-chip chip-one"><Coins size={14} /> Diamonds</span><span className="float-chip chip-two"><Sparkles size={14} /> Keep it up</span><span className="sparkle sparkle-one">✦</span><span className="sparkle sparkle-two">✧</span></div></div><div className="user-metrics"><MetricCard label="Diamonds delivered" value={total.toLocaleString()} detail="across all your deliveries" icon={Coins} tone="violet-tone" /><MetricCard label="Total earnings" value={usd(total)} detail="$5 per 100,000 diamonds" icon={Wallet} tone="mint-tone" /><button className="profile-mini-card" onClick={onEdit}><div className="mini-card-top"><span>Your ShamCash</span><Settings2 size={16} /></div><strong>{shamcash || 'Add your account number'}</strong><small>Edit profile details <ArrowRight size={12} /></small></button></div><div className="table-section history-table user-history"><div className="table-heading"><div><h2>Delivery history</h2><span className="muted-count">Your recent diamond deliveries</span></div><span className="period-pill"><span className="period-dot" /> All time</span></div><div className="table-scroll"><table><thead><tr><th>DELIVERY DATE</th><th>DIAMONDS</th><th>ESTIMATED VALUE</th><th>CONFIRMATION</th></tr></thead><tbody>{deliveries.map((item) => <tr key={item.id}><td><span className="date-cell"><span className="date-icon"><Clock3 size={15} /></span>{item.date}</span></td><td><strong className="table-number">{item.diamonds.toLocaleString()}</strong></td><td><strong className="payout-number">{usd(item.diamonds)}</strong></td><td><span className="confirmed-pill"><Check size={12} /> Submitted</span></td></tr>)}</tbody></table>{deliveries.length === 0 && <div className="empty-state"><ArrowDownLeft size={20} /><strong>No deliveries yet</strong><span>Your submitted deliveries will appear here.</span></div>}</div><div className="table-footer"><span>Showing <strong>{deliveries.length}</strong> deliveries</span><span className="secure-note"><ShieldCheck size={14} /> Your delivery history is private</span></div></div></></Translate>
}

export default App
