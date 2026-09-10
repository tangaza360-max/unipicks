import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { X } from 'lucide-react'

export default function AdminUsers() {
  const [students, setStudents] = useState([])
  const [merchants, setMerchants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('students') // 'students' | 'merchants'
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')

    try {
      const { data: studentsData, error: studentsError } = await supabase.rpc('get_all_students')
      if (studentsError) {
        console.warn('Error fetching students:', studentsError)
      }

      const { data: merchantsData, error: merchantsError } = await supabase.rpc('get_all_merchants')
      if (merchantsError) {
        console.warn('Error fetching merchants:', merchantsError)
      }

      setStudents(studentsData || [])
      setMerchants(merchantsData || [])
    } catch (err) {
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function toggleBan(userId, currentStatus) {
    const action = currentStatus === 'banned' ? 'unban' : 'ban'
    const confirmed = window.confirm(`Are you sure you want to ${action} this user?`)
    if (!confirmed) return

    const functionName = action === 'ban' ? 'admin_ban_user' : 'admin_unban_user'
    const { data, error } = await supabase.rpc(functionName, {
      target_user_id: userId,
    })

    if (error) {
      alert(`Failed to ${action} user: ${error.message}`)
    } else {
      const target = [...students, ...merchants].find((user) => user.id === userId)
      await supabase.rpc('log_admin_action', {
        action: action === 'ban' ? 'ban_user' : 'unban_user',
        target_type: target?.role || (students.some((user) => user.id === userId) ? 'student' : 'merchant'),
        target_id: userId,
        target_name: target?.full_name || target?.business_name || target?.email || 'Unknown user',
        details: { previous_status: currentStatus ? 'banned' : 'active' },
      })
      loadUsers()
    }
  }

  async function deleteUser(userId) {
    const confirmed = window.confirm('Permanently delete this user? This action cannot be undone.')
    if (!confirmed) return

    const { data, error } = await supabase.rpc('admin_delete_user', {
      target_user_id: userId,
    })

    if (error) {
      alert(`Failed to delete user: ${error.message}`)
    } else {
      const target = [...students, ...merchants].find((user) => user.id === userId)
      await supabase.rpc('log_admin_action', {
        action: 'delete_user', target_type: target?.role || 'user', target_id: userId,
        target_name: target?.full_name || target?.business_name || target?.email || 'Unknown user', details: {},
      })
      loadUsers()
    }
  }

  const filterUsers = (users) => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase().trim()
    return users.filter((u) =>
      (u.full_name?.toLowerCase() || '').includes(query) ||
      (u.email?.toLowerCase() || '').includes(query) ||
      (u.business_name?.toLowerCase() || '').includes(query)
    )
  }

  const filteredStudents = filterUsers(students)
  const filteredMerchants = filterUsers(merchants)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading users…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Could not load users: {error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">User Management</h2>
        <p className="text-muted-foreground text-sm">View and manage all platform users</p>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search users by name, email, or business..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-input border border-input rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-border pb-3">
        <button
          onClick={() => setActiveTab('students')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'students'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground border border-border'
          }`}
        >
          Students ({students.length})
        </button>
        <button
          onClick={() => setActiveTab('merchants')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === 'merchants'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground border border-border'
          }`}
        >
          Merchants ({merchants.length})
        </button>
      </div>

      {activeTab === 'students' && (
        <UserTable
          users={filteredStudents}
          type="student"
          onToggleBan={toggleBan}
          onDelete={deleteUser}
        />
      )}

      {activeTab === 'merchants' && (
        <UserTable
          users={filteredMerchants}
          type="merchant"
          onToggleBan={toggleBan}
          onDelete={deleteUser}
        />
      )}
    </div>
  )
}

function UserTable({ users, type, onToggleBan, onDelete }) {
  if (users.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground">
          No {type}s found{type === 'merchant' ? ' (including unapproved)' : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Name</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Email</th>
              {type === 'merchant' && (
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Business</th>
              )}
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 text-foreground">{user.full_name || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                {type === 'merchant' && (
                  <td className="px-4 py-3 text-foreground">
                    {user.business_name || '—'}
                    {user.approved === false && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                        Pending
                      </span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    user.banned
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {user.banned ? 'Banned' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onToggleBan(user.id, user.banned)}
                      className={`text-xs px-3 py-1 rounded-lg transition ${
                        user.banned
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                      }`}
                    >
                      {user.banned ? 'Unban' : 'Ban'}
                    </button>
                    <button
                      onClick={() => onDelete(user.id)}
                      className="text-xs px-3 py-1 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}