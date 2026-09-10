import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { CheckCircle2, Clock, Eye } from 'lucide-react'

export default function AdminStudentView() {
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentData, setStudentData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [error, setError] = useState('')

  // Load list of all students (only works for admins)
  useEffect(() => {
    async function loadStudents() {
      setLoadingStudents(true)
      const { data, error } = await supabase.rpc('get_all_students')
      if (error) {
        setError(error.message)
      } else {
        setStudents(data || [])
        if (data && data.length > 0) {
          setSelectedStudentId(data[0].id)
        }
      }
      setLoadingStudents(false)
    }
    loadStudents()
  }, [])

  // Load selected student's data when selection changes
  useEffect(() => {
    if (!selectedStudentId) return
    async function loadStudentData() {
      setLoading(true)
      setStudentData(null)

      // 1. Get student's profile info from the students list (already loaded)
      const selectedStudent = students.find(s => s.id === selectedStudentId)
      if (!selectedStudent) {
        setError('Student not found')
        setLoading(false)
        return
      }

      // Build a userData object that matches the old structure
      const userData = {
        id: selectedStudent.id,
        email: selectedStudent.email,
        raw_user_meta_data: {
          full_name: selectedStudent.full_name,
          university: selectedStudent.university,
          student_id: selectedStudent.student_id
        }
      }

      // 2. Get all deals (for display) — removed .eq('approved', true)
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false })

      if (dealsError) {
        setError(dealsError.message)
        setLoading(false)
        return
      }

      // 3. Get group orders hosted by this student
      const { data: hostedOrders, error: hostedError } = await supabase
        .from('group_orders')
        .select('*, deals(title, business_name, price, discount_percent)')
        .eq('created_by', selectedStudentId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (hostedError) {
        setError(hostedError.message)
        setLoading(false)
        return
      }

      // 4. Get group orders this student has joined
      const { data: joinedMemberships, error: joinedError } = await supabase
        .from('group_order_members')
        .select('*, group_orders(*, deals(title, business_name, price, discount_percent))')
        .eq('student_id', selectedStudentId)
        .order('joined_at', { ascending: false })

      if (joinedError) {
        setError(joinedError.message)
        setLoading(false)
        return
      }

      // 5. Get redemption history for this student
      const { data: redemptions, error: redemptionError } = await supabase
        .from('redemptions')
        .select('*, deals(title, business_name)')
        .eq('student_id', selectedStudentId)
        .order('redeemed_at', { ascending: false })

      if (redemptionError) {
        setError(redemptionError.message)
        setLoading(false)
        return
      }

      setStudentData({
        user: userData,
        deals: deals || [],
        hostedOrders: hostedOrders || [],
        joinedMemberships: joinedMemberships || [],
        redemptions: redemptions || [],
      })
      setLoading(false)
      setError('')
    }

    loadStudentData()
  }, [selectedStudentId, students])

  if (loadingStudents) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Student Lookup</h2>
        <p className="text-muted-foreground text-sm">Loading students…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Student Lookup</h2>
        <p className="text-sm text-red-400">Error: {error}</p>
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Student Lookup</h2>
        <p className="text-muted-foreground text-sm">No students found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Student Lookup</h2>
        <p className="text-muted-foreground text-sm">Select a student to view their dashboard</p>
      </div>

      {/* Student selector */}
      <div className="max-w-sm">
        <select
          className="field-input"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(e.target.value)}
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.full_name || student.email} — {student.university || 'No university'}
            </option>
          ))}
        </select>
      </div>

      {/* Student dashboard preview */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading student data…</p>
      ) : studentData ? (
        <div className="space-y-6 bg-card/40 border border-border rounded-lg p-4">
          {/* Student info */}
          <div className="border-b border-border pb-3">
            <p className="font-semibold text-lg">
              {studentData.user?.raw_user_meta_data?.full_name || 'Unnamed student'}
            </p>
            <p className="text-muted-foreground text-sm">{studentData.user?.email}</p>
            <p className="text-muted-foreground text-sm">
              {studentData.user?.raw_user_meta_data?.university || 'No university'} · 
              ID: {studentData.user?.raw_user_meta_data?.student_id || 'N/A'}
            </p>
          </div>

          {/* Deals feed */}
          <div>
            <h3 className="font-display text-md font-semibold mb-2">Deals Feed</h3>
            {studentData.deals.length === 0 ? (
              <p className="text-muted-foreground text-sm">No deals available.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {studentData.deals.slice(0, 5).map((deal) => (
                  <div key={deal.id} className="border border-border rounded-lg p-3">
                    <p className="font-medium text-sm">{deal.title}</p>
                    <p className="text-muted-foreground text-xs">{deal.business_name}</p>
                    {deal.discount_percent && (
                      <span className="text-accent text-xs">{deal.discount_percent}% off</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hosted orders */}
          <div>
            <h3 className="font-display text-md font-semibold mb-2">Hosted Group Orders</h3>
            {studentData.hostedOrders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hosted orders.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {studentData.hostedOrders.map((order) => (
                  <div key={order.id} className="border border-border rounded-lg p-2 text-sm">
                    <span className="font-medium">{order.deals?.title}</span>
                    <span className="text-muted-foreground text-xs ml-2">· {order.status}</span>
                    <span className="text-muted-foreground text-xs ml-2">{order.join_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Joined orders */}
          <div>
            <h3 className="font-display text-md font-semibold mb-2">Joined Orders</h3>
            {studentData.joinedMemberships.length === 0 ? (
              <p className="text-muted-foreground text-sm">Hasn't joined any group orders.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {studentData.joinedMemberships.map((membership) => (
                  <div key={membership.id} className="border border-border rounded-lg p-2 text-sm">
                    <span className="font-medium">{membership.group_orders?.deals?.title}</span>
                    <span className="text-muted-foreground text-xs ml-2">× {membership.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order history */}
          <div>
            <h3 className="font-display text-md font-semibold mb-2">Order History</h3>
            {studentData.redemptions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {studentData.redemptions.map((redemption) => (
                  <div key={redemption.id} className="border border-border rounded-lg p-2 text-sm">
                    <span className="font-medium">{redemption.deals?.title}</span>
                    <span className="text-muted-foreground text-xs ml-2 inline-flex items-center gap-1">
                      {redemption.status === 'redeemed' ? (
                        <><CheckCircle2 size={12} /> Ordered</>
                      ) : (
                        <><Clock size={12} /> Pending</>
                      )}
                    </span>
                    {redemption.redeemed_at && (
                      <span className="text-muted-foreground text-xs ml-2">
                        {new Date(redemption.redeemed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-muted-foreground text-xs text-center border-t border-border pt-3 flex items-center justify-center gap-1.5">
            <Eye size={13} /> Read-only preview — you're viewing this student's dashboard as an admin
          </p>
        </div>
      ) : null}
    </div>
  )
}