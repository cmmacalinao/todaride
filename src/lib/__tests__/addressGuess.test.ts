import { describe, expect, it } from 'vitest'
import { guessPhAddressFromLabel } from '../customLocation'

// Turning what OpenStreetMap calls a place into what this app calls it.
// The two rarely agree on a city's full name, and every mismatch used to
// cost the barangay too.
describe('reading a PH address out of a geocoded label', () => {
  it('recognises San Jose City when the map only says San Jose', () => {
    // The exact failure a passenger hit: pinned in San Jose, told the app
    // "Caanawan, San Jose", and was handed CLSU — the default barangay of a
    // different city — then asked which campus building they meant.
    const guess = guessPhAddressFromLabel('Caanawan, San Jose, Nueva Ecija, Philippines')
    expect(guess?.city).toBe('San Jose City')
  })

  it('still recognises the full name when the map spells it out', () => {
    const guess = guessPhAddressFromLabel('Caanawan, San Jose City, Nueva Ecija')
    expect(guess?.city).toBe('San Jose City')
  })

  it('recognises Muñoz however the map dresses it up', () => {
    const short = guessPhAddressFromLabel('CLSU, Muñoz, Nueva Ecija')
    const long = guessPhAddressFromLabel('CLSU, Science City of Muñoz, Nueva Ecija')
    expect(short?.city).toBe('Science City of Muñoz')
    expect(long?.city).toBe('Science City of Muñoz')
  })

  it('gives up on a province it does not know rather than guessing', () => {
    // No province means no city list to match against, and a confident
    // wrong answer is worse than an empty one.
    expect(guessPhAddressFromLabel('Somewhere, Cebu City, Cebu')).toBeNull()
  })

  it('reports the province alone when the city is unrecognisable', () => {
    const guess = guessPhAddressFromLabel('Some Barrio, Nueva Ecija')
    expect(guess?.province).toBe('Nueva Ecija')
    expect(guess?.city).toBe('')
  })
})
