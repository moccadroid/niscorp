import type { PrismStory } from '../../story-types';

export const apiToUiStory: PrismStory = {
  id: 'api-to-ui',
  name: 'API → UI shape',
  description:
    'A realistic transformation: take a verbose API response with metadata + paginated results and shape it into the leaner JSON a UI actually consumes.',
  category: 'Real world',
  kind: 'transform',
  input: {
    response: {
      meta: { total: 3, page: 1, perPage: 10 },
      data: [
        {
          id: 'user_001',
          attributes: { displayName: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: '/avatars/ada.png' },
          permissions: { canEdit: true, canDelete: false },
        },
        {
          id: 'user_002',
          attributes: { displayName: 'Grace Hopper', email: 'grace@example.com', avatarUrl: '/avatars/grace.png' },
          permissions: { canEdit: true, canDelete: true },
        },
        {
          id: 'user_003',
          attributes: { displayName: 'Linus Torvalds', email: 'linus@example.com', avatarUrl: '/avatars/linus.png' },
          permissions: { canEdit: false, canDelete: false },
        },
      ],
    },
  },
  config: {
    total: { $ref: '$.response.meta.total' },
    users: {
      $map: {
        over: { $ref: '$.response.data' },
        as: 'u',
        body: {
          id: { $get: { from: { $var: 'u' }, path: ['id'] } },
          name: { $get: { from: { $var: 'u' }, path: ['attributes', 'displayName'] } },
          email: { $get: { from: { $var: 'u' }, path: ['attributes', 'email'] } },
          avatar: { $get: { from: { $var: 'u' }, path: ['attributes', 'avatarUrl'] } },
          isAdmin: { $get: { from: { $var: 'u' }, path: ['permissions', 'canDelete'] } },
        },
      },
    },
  },
  expected: {
    total: 3,
    users: [
      { id: 'user_001', name: 'Ada Lovelace', email: 'ada@example.com', avatar: '/avatars/ada.png', isAdmin: false },
      { id: 'user_002', name: 'Grace Hopper', email: 'grace@example.com', avatar: '/avatars/grace.png', isAdmin: true },
      { id: 'user_003', name: 'Linus Torvalds', email: 'linus@example.com', avatar: '/avatars/linus.png', isAdmin: false },
    ],
  },
};
