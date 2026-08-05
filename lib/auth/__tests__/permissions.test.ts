import { expect, test } from 'vitest'
import { canSignIn, type Role } from '@/lib/domain/types'
import { can, type SessionUser } from '../permissions'

const user = (role: Role, departmentId: string | null = null, id = 'u1'): SessionUser => ({
  id,
  name: 'Test',
  email: 'test@nove.group',
  role,
  departmentId,
})

const ALL_ACTIONS = [
  'view:report',
  'manage:users',
  'manage:periods',
  'manage:departments',
  'manage:help',
  'create:objective',
  'edit:objective',
  'checkin:kr',
] as const

test('admin can do everything', () => {
  const admin = user('admin')
  for (const action of ALL_ACTIONS) {
    expect(can(admin, action), action).toBe(true)
  }
})

test('admin is not scoped to a department', () => {
  const admin = user('admin', 'ik')
  expect(can(admin, 'create:objective', { departmentId: 'finans' })).toBe(true)
  expect(can(admin, 'checkin:kr', { ownerUserId: 'someone-else' })).toBe(true)
})

test('executive reads the report and nothing else', () => {
  const exec = user('executive')
  expect(can(exec, 'view:report')).toBe(true)
  for (const action of ALL_ACTIONS.filter((a) => a !== 'view:report')) {
    expect(can(exec, action), action).toBe(false)
  }
})

test('staff are personnel records and can do nothing', () => {
  const person = user('staff', 'saha')
  for (const action of ALL_ACTIONS) {
    expect(can(person, action), action).toBe(false)
  }
})

test('only admin and executive may sign in', () => {
  expect(canSignIn('admin')).toBe(true)
  expect(canSignIn('executive')).toBe(true)
  expect(canSignIn('staff')).toBe(false)
})
