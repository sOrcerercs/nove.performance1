import { expect, test } from 'vitest'
import { managerCandidates, subtreeOf, wouldCreateCycle } from '../hierarchy'

// mudur ← lider ← uzman ; mudur ← lider2 ; baska stands alone ; eski is passive.
const USERS = [
  { id: 'mudur', managerId: null, state: 'active' as const },
  { id: 'lider', managerId: 'mudur', state: 'active' as const },
  { id: 'uzman', managerId: 'lider', state: 'active' as const },
  { id: 'lider2', managerId: 'mudur', state: 'active' as const },
  { id: 'baska', managerId: null, state: 'active' as const },
  { id: 'eski', managerId: null, state: 'passive' as const },
]

test('the subtree is everyone below, at any depth, excluding the root', () => {
  expect(subtreeOf('mudur', USERS).sort()).toEqual(['lider', 'lider2', 'uzman'])
  expect(subtreeOf('lider', USERS)).toEqual(['uzman'])
  expect(subtreeOf('uzman', USERS)).toEqual([])
})

test('a cycle already in the data does not loop forever', () => {
  const cyclic = [
    { id: 'a', managerId: 'c' },
    { id: 'b', managerId: 'a' },
    { id: 'c', managerId: 'b' },
  ]
  expect(subtreeOf('a', cyclic).sort()).toEqual(['b', 'c'])
})

test('reporting to yourself or to someone below you is a cycle', () => {
  expect(wouldCreateCycle('mudur', 'mudur', USERS)).toBe(true)
  expect(wouldCreateCycle('mudur', 'uzman', USERS)).toBe(true)
  expect(wouldCreateCycle('uzman', 'lider2', USERS)).toBe(false)
  expect(wouldCreateCycle('uzman', null, USERS)).toBe(false)
})

test('manager candidates exclude the person, their subtree, and passive people', () => {
  const ids = managerCandidates('lider', USERS).map((u) => u.id).sort()
  expect(ids).toEqual(['baska', 'lider2', 'mudur'])
})
