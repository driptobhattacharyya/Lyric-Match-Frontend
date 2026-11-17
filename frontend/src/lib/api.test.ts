import { describe, expect, test } from 'bun:test'
import { cleanName, validateName } from './api'

describe('name rule (mirrors backend clean_name)', () => {
  test('trims and collapses whitespace like the server', () => {
    expect(cleanName('  Dripto   the  Great ')).toBe('Dripto the Great')
    expect(validateName('  a' + ' '.repeat(10) + 'b  ')).toBeNull()
  })

  test('accepts ASCII letters, digits, space, _ - .', () => {
    expect(validateName('Dripto_99 -.x')).toBeNull()
  })

  test('rejects what the server rejects', () => {
    expect(validateName('   ')).not.toBeNull()
    expect(validateName('x'.repeat(21))).not.toBeNull()
    expect(validateName('Rāhul')).not.toBeNull()
    expect(validateName('राहुल')).not.toBeNull()
    expect(validateName('bob!')).not.toBeNull()
  })
})
