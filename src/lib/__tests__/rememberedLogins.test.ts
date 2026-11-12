import { describe, expect, it } from 'vitest'
import {
  REMEMBERED_LIMIT,
  matchingRememberedLogins,
  readRememberedLogins,
  withRememberedLogin,
  withoutRememberedLogin,
  type RememberedLogin,
} from '../rememberedLogins'

const entry = (identifier: string, at = '2026-11-12T00:00:00.000Z'): RememberedLogin => ({ identifier, at })

describe('remembering who signed in on this device', () => {
  it('puts the most recent first', () => {
    const list = withRememberedLogin([entry('Celeste M.')], 'Miguel D.', '2026-11-12T10:00:00.000Z')
    expect(list.map((e) => e.identifier)).toEqual(['Miguel D.', 'Celeste M.'])
  })

  it('does not list the same person twice', () => {
    const list = withRememberedLogin([entry('Celeste M.')], 'Celeste M.', '2026-11-12T10:00:00.000Z')
    expect(list).toHaveLength(1)
    expect(list[0].at).toBe('2026-11-12T10:00:00.000Z')
  })

  it('counts the same identifier written differently as one', () => {
    // A number typed with dashes one day and without the next is one person.
    const list = withRememberedLogin([entry('0917-200-2001')], '09172002001', '2026-11-12T10:00:00.000Z')
    expect(list).toHaveLength(1)
    expect(list[0].identifier).toBe('09172002001')
    expect(withRememberedLogin([entry('Celeste M.')], 'celeste m.', '2026-11-12T10:00:00.000Z')).toHaveLength(1)
  })

  it('keeps a shared phone short', () => {
    let list: RememberedLogin[] = []
    for (const name of ['One', 'Two', 'Three', 'Four', 'Five']) {
      list = withRememberedLogin(list, name, '2026-11-12T10:00:00.000Z')
    }
    expect(list).toHaveLength(REMEMBERED_LIMIT)
    expect(list[0].identifier).toBe('Five')
  })

  it('ignores a blank identifier', () => {
    expect(withRememberedLogin([entry('Celeste M.')], '   ', '2026-11-12T10:00:00.000Z')).toHaveLength(1)
  })

  it('forgets one on request', () => {
    const list = withoutRememberedLogin([entry('Celeste M.'), entry('Miguel D.')], 'celeste m.')
    expect(list.map((e) => e.identifier)).toEqual(['Miguel D.'])
  })
})

describe('what the box offers', () => {
  const list = [entry('Celeste M.'), entry('Miguel D.'), entry('0917-200-2001')]

  it('offers everything remembered before anything is typed', () => {
    expect(matchingRememberedLogins(list, '')).toHaveLength(3)
  })

  it('narrows as they type', () => {
    expect(matchingRememberedLogins(list, 'mig').map((e) => e.identifier)).toEqual(['Miguel D.'])
    expect(matchingRememberedLogins(list, '0917').map((e) => e.identifier)).toEqual(['0917-200-2001'])
  })

  it('offers nothing once what is typed is already the whole thing', () => {
    // Suggesting the words somebody has just finished typing is noise.
    expect(matchingRememberedLogins(list, 'Celeste M.')).toEqual([])
  })

  it('offers nothing for a stranger', () => {
    expect(matchingRememberedLogins(list, 'Juan')).toEqual([])
  })
})

describe('reading what was stored', () => {
  const storage = (raw: string | null) => ({ getItem: () => raw })

  it('is empty on a device nobody has used', () => {
    expect(readRememberedLogins(storage(null))).toEqual([])
  })

  it('reads back what was written', () => {
    expect(readRememberedLogins(storage(JSON.stringify([entry('Celeste M.')])))).toHaveLength(1)
  })

  it('survives nonsense rather than blocking the login', () => {
    // A corrupt convenience must never be able to stop somebody signing in.
    expect(readRememberedLogins(storage('not json'))).toEqual([])
    expect(readRememberedLogins(storage('{"not":"an array"}'))).toEqual([])
    expect(readRememberedLogins(storage(JSON.stringify([{ nope: 1 }, entry('Celeste M.')])))).toHaveLength(1)
  })

  it('survives storage that throws', () => {
    const throwing = {
      getItem() {
        throw new Error('denied')
      },
    }
    expect(readRememberedLogins(throwing)).toEqual([])
    expect(readRememberedLogins(undefined)).toEqual([])
  })
})
