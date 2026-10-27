import { ProfileButton } from './profile-button';

/** Stack screens: back on the left, the profile icon on the right (CLAUDE.md "Navigation"). */
export const stackScreenOptions = {
  headerBackButtonDisplayMode: 'minimal' as const,
  headerRight: () => <ProfileButton />,
};
