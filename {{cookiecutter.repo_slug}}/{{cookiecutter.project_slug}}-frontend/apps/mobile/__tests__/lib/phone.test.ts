import { phoneOf } from '@/lib/phone'

describe('phoneOf', () => {
  it('sends a number that was given', () => {
    expect(phoneOf('+14155550123')).toEqual({ phone: '+14155550123' })
  })

  it('sends no number when an optional one was left empty', () => {
    expect(phoneOf('')).toEqual({})
  })
})

describe('PHONE', () => {
  it('is one of the options the project could be generated with', () => {
    const { PHONE } = jest.requireActual('@/lib/phoneOption')
    expect(['none', 'optional', 'required']).toContain(PHONE)
  })
})
