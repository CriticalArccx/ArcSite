import { useEffect } from 'react'
import { useGetAuthorizedUsersDirectory } from '../../../lib/api'
import type { PersonOption } from '../../../lib/api'

/**
 * Fetches the authorized-users directory (name/email only, not role/allowedProjects — see
 * PersonOption in api.ts) once per mount — shared by every "assign to a specific person" UI
 * (AssignPopover, TeamsManager, TodoPage's task form, Settings' DefaultAssigneePicker) so a person
 * can only ever be picked from the roster, never typed freehand. Goes through
 * arcapp_authorized_users_directory() (a SECURITY DEFINER function, not a direct table read) so
 * this works for any signed-in authorized user even though the full roster — who's an admin, and
 * which project(s) they can reach — is admin-only to read as of 2026-11-03.
 */
export function useAuthorizedUsersOptions() {
  const usersFn = useGetAuthorizedUsersDirectory()
  useEffect(() => {
    void usersFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return {
    users: (usersFn.data as PersonOption[] | undefined) ?? [],
    loading: usersFn.loading || !usersFn.data,
    error: usersFn.error,
    retry: () => void usersFn.trigger(),
  }
}

type Props = {
  users: PersonOption[]
  loadingUsers: boolean
  /** Selected email, or '' for nothing selected. */
  value: string
  onChange: (email: string) => void
  disabled?: boolean
  /** Previously-saved display name, shown alongside a stale email that's no longer on the
   * authorized list — kept visible/selectable rather than silently dropped (same pattern as
   * CxAlloyStatusPicker's stale-value handling). */
  staleName?: string | null
}

export default function PersonSelect({ users, loadingUsers, value, onChange, disabled, staleName }: Props) {
  const selectedUser = users.find((u) => u.email.toLowerCase() === value.toLowerCase())
  const stale = !!value && !selectedUser
  return (
    <select value={value} disabled={disabled || loadingUsers} onChange={(e) => onChange(e.target.value)}>
      <option value="">{loadingUsers ? 'Loading people…' : '— Select a person —'}</option>
      {users.map((u) => (
        <option key={u.id} value={u.email}>
          {u.name ? `${u.name} (${u.email})` : u.email}
        </option>
      ))}
      {stale && <option value={value}>{(staleName ? `${staleName} (${value})` : value) + ' — not in Authorized Users'}</option>}
    </select>
  )
}
