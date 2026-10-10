// "Fred M and 2 other friends liked this" wording.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app (JSX file, pure function)
import { friendsLikedText } from '../../../src/components/DealTile.jsx'

Deno.test('friends who liked a deal, in plain words', () => {
  assertEquals(friendsLikedText(null), '')
  assertEquals(friendsLikedText({ friend_like_count: 0, friend_name: null }), '')
  assertEquals(friendsLikedText({ friend_like_count: 1, friend_name: 'Fred M' }), 'Fred M liked this')
  assertEquals(friendsLikedText({ friend_like_count: 2, friend_name: 'Fred M' }), 'Fred M and 1 other friend liked this')
  assertEquals(friendsLikedText({ friend_like_count: 13, friend_name: 'Fred M' }), 'Fred M and 12 other friends liked this')
  assertEquals(friendsLikedText({ friend_like_count: 3, friend_name: null }), '3 friends liked this')
})
