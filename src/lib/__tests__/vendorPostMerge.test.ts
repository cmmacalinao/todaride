import { describe, expect, it } from 'vitest'
import { mergeVendorPosts } from '../rideMerge'
import type { Pharmacy, VendorPost } from '../../types'

const post = (id: string, createdAt: string, extra: Partial<VendorPost> = {}): VendorPost => ({
  id,
  text: id,
  photoDataUrl: null,
  productId: null,
  createdAt,
  ...extra,
})

const store = (extra: Partial<Pharmacy>): Pharmacy => ({ id: 'v1', name: 'Store', ...extra }) as Pharmacy

describe('mergeVendorPosts', () => {
  it('keeps a post this device made that the incoming copy has not seen', () => {
    const local = [store({ posts: [post('new', '2026-09-08T01:00:00Z'), post('old', '2026-09-07T01:00:00Z')] })]
    const incoming = [store({ posts: [post('old', '2026-09-07T01:00:00Z')] })]
    const merged = mergeVendorPosts(local, incoming)
    expect(merged[0].posts?.map((p) => p.id)).toEqual(['new', 'old'])
  })

  it('adopts a post made elsewhere', () => {
    const local = [store({ posts: [] })]
    const incoming = [store({ posts: [post('theirs', '2026-09-08T01:00:00Z')] })]
    expect(mergeVendorPosts(local, incoming)[0].posts?.map((p) => p.id)).toEqual(['theirs'])
  })

  it('does not bring back a post deleted on either side', () => {
    const local = [store({ posts: [post('gone', '2026-09-08T01:00:00Z')] })]
    const incoming = [store({ posts: [], removedPostIds: ['gone'] })]
    const merged = mergeVendorPosts(local, incoming)
    expect(merged[0].posts).toEqual([])
    expect(merged[0].removedPostIds).toEqual(['gone'])

    const localDeleted = [store({ posts: [], removedPostIds: ['gone'] })]
    const incomingStale = [store({ posts: [post('gone', '2026-09-08T01:00:00Z')] })]
    expect(mergeVendorPosts(localDeleted, incomingStale)[0].posts).toEqual([])
  })

  it('unions likes, hearts and comments on a post both sides know', () => {
    const local = [
      store({
        posts: [post('p', '2026-09-08T01:00:00Z', { likes: ['a'], comments: [{ id: 'c1', authorId: 'a', authorName: 'A', text: 'hi', createdAt: '2026-09-08T01:01:00Z' }] })],
      }),
    ]
    const incoming = [
      store({
        posts: [post('p', '2026-09-08T01:00:00Z', { likes: ['b'], hearts: ['b'], comments: [{ id: 'c2', authorId: 'b', authorName: 'B', text: 'yo', createdAt: '2026-09-08T01:02:00Z' }] })],
      }),
    ]
    const [merged] = mergeVendorPosts(local, incoming)[0].posts ?? []
    expect(merged.likes?.sort()).toEqual(['a', 'b'])
    expect(merged.hearts).toEqual(['b'])
    expect(merged.comments?.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('keeps only the newest three', () => {
    const local = [store({ posts: [post('a', '2026-09-08T04:00:00Z'), post('b', '2026-09-08T03:00:00Z')] })]
    const incoming = [store({ posts: [post('c', '2026-09-08T02:00:00Z'), post('d', '2026-09-08T01:00:00Z')] })]
    expect(mergeVendorPosts(local, incoming)[0].posts?.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})
