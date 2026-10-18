import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { WaitlistState } from '../validate';

const joinWaitlist = vi.fn<(state: WaitlistState, data: FormData) => Promise<WaitlistState>>();
vi.mock('../actions', () => ({
  joinWaitlist: (state: WaitlistState, data: FormData) => joinWaitlist(state, data),
}));

const { WaitlistForm } = await import('../waitlist-form');

describe('WaitlistForm', () => {
  it('has a labelled email field, consent checkbox and privacy link', () => {
    render(<WaitlistForm />);
    expect(screen.getByLabelText('Email address')).toBeDefined();
    expect(screen.getByRole('checkbox')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
  });

  it('shows the confirmation after joining', async () => {
    joinWaitlist.mockResolvedValue({ status: 'success' });
    render(<WaitlistForm />);
    await userEvent.type(screen.getByLabelText('Email address'), 'ana@example.com');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    expect(await screen.findByRole('status')).toBeDefined();
    const data = joinWaitlist.mock.calls[0]?.[1];
    expect(data?.get('email')).toBe('ana@example.com');
    expect(data?.get('consent')).toBe('on');
  });

  it('shows the error and keeps the email', async () => {
    joinWaitlist.mockResolvedValue({
      status: 'error',
      error: 'consentRequired',
      email: 'ana@example.com',
      consent: false,
    });
    render(<WaitlistForm />);
    await userEvent.type(screen.getByLabelText('Email address'), 'ana@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));

    expect(
      await screen.findByText('Please confirm that we may store your email address.'),
    ).toBeDefined();
    expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe(
      'ana@example.com',
    );
  });
});
