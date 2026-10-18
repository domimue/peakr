import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HrZonesCalculator } from '../calculators/hr-zones-calculator';
import { PaceCalculator } from '../calculators/pace-calculator';
import { SwimCssCalculator } from '../calculators/swim-css-calculator';
import { Zone2Calculator } from '../calculators/zone2-calculator';

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('Heart rate zones', () => {
  it('shows %HRmax zones with an estimated HRmax after entering the age', () => {
    render(<HrZonesCalculator />);
    expect(screen.queryByText('Your zones')).toBeNull();

    type('Age', '30');

    expect(screen.getByRole('heading', { name: 'Your zones' })).toBeDefined();
    expect(screen.getByText('187 bpm')).toBeDefined();
    expect(screen.getByText('Estimate')).toBeDefined();
    expect(screen.getByText('112–130 bpm')).toBeDefined();
    expect(screen.getByText('168–187 bpm')).toBeDefined();
  });

  it('colour-codes the five zones from Z1 to Z5', () => {
    const { container } = render(<HrZonesCalculator />);
    type('Age', '30');
    const bars = container.querySelectorAll('tbody tr span[aria-hidden]');
    expect([...bars].map((bar) => bar.className.match(/bg-zone-\d/)?.[0])).toEqual([
      'bg-zone-1',
      'bg-zone-2',
      'bg-zone-3',
      'bg-zone-4',
      'bg-zone-5',
    ]);
  });

  it('switches to Karvonen automatically once resting HR is entered', () => {
    render(<HrZonesCalculator />);
    type('Age', '30');
    type('Resting heart rate (optional)', '60');

    expect(screen.getByRole('radio', { name: 'Karvonen' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByLabelText('Resting heart rate')).toBeDefined();
    expect(screen.getByText('136–148 bpm')).toBeDefined();
  });

  it('shows open-ended LTHR zones', () => {
    render(<HrZonesCalculator />);
    fireEvent.click(screen.getByRole('radio', { name: 'LTHR' }));
    type('Threshold heart rate (LTHR)', '170');

    expect(screen.getByText('up to 144 bpm')).toBeDefined();
    expect(screen.getByText('170+ bpm')).toBeDefined();
    expect(screen.queryByText('Estimate')).toBeNull();
  });

  it('shows range errors only after leaving the field', () => {
    render(<HrZonesCalculator />);
    const age = screen.getByLabelText('Age');
    fireEvent.change(age, { target: { value: '5' } });
    expect(screen.queryByText('Enter a value between 10 and 100.')).toBeNull();

    fireEvent.blur(age);
    expect(screen.getByRole('alert').textContent).toBe('Enter a value between 10 and 100.');
    expect(age.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('Your zones')).toBeNull();
  });

  it('rejects non-numeric input immediately', () => {
    render(<HrZonesCalculator />);
    type('Age', '3a');
    expect(screen.getByText('Enter a whole number.')).toBeDefined();
  });
});

describe('Zone 2 calculator', () => {
  it('shows the Zone 2 range and highlights it in the table', () => {
    render(<Zone2Calculator />);
    type('Age', '30');

    expect(screen.getByText('Your Zone 2')).toBeDefined();
    // Headline result plus the highlighted row in the table.
    expect(screen.getAllByText('112–130 bpm')).toHaveLength(2);
    const highlighted = screen
      .getAllByRole('row')
      .find((row) => row.getAttribute('aria-current') === 'true');
    expect(highlighted?.getAttribute('data-zone')).toBe('2');
    expect(screen.getByText('60–70 % of your max heart rate (187 bpm).')).toBeDefined();
  });
});

describe('Pace & race predictor', () => {
  it('predicts race times and pace zones from a 10 km result', () => {
    render(<PaceCalculator />);
    type('Your 10 km time, minutes', '50');

    // Race pace headline and the 10 km row of the predictions table.
    expect(screen.getAllByText('5:00 /km')).toHaveLength(2);
    expect(screen.getByText('23:59')).toBeDefined();
    expect(screen.getByText('1:50:19')).toBeDefined();
    expect(screen.getByText('6:31 /km or slower')).toBeDefined();
  });

  it('relabels the time field when the distance changes', () => {
    render(<PaceCalculator />);
    fireEvent.click(screen.getByRole('radio', { name: 'Half marathon' }));
    expect(screen.getByRole('group', { name: 'Your Half marathon time' })).toBeDefined();
  });

  it('rejects seconds of 60 or more', () => {
    render(<PaceCalculator />);
    type('Your 10 km time, minutes', '50');
    type('Your 10 km time, seconds', '75');
    expect(screen.getByText('Minutes and seconds must be below 60.')).toBeDefined();
  });

  it('flags an unrealistic time with formatted limits after leaving the field', () => {
    render(<PaceCalculator />);
    fireEvent.click(screen.getByRole('radio', { name: '5 km' }));
    const minutes = screen.getByLabelText('Your 5 km time, minutes');
    fireEvent.change(minutes, { target: { value: '9' } });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.blur(minutes);
    expect(screen.getByRole('alert').textContent).toBe(
      'This time looks unrealistic for the distance. Enter a time between 12:30 and 1:15:00.',
    );
  });

  it('ignores non-digit characters in duration parts', () => {
    render(<PaceCalculator />);
    type('Your 10 km time, minutes', '5a0');
    expect((screen.getByLabelText('Your 10 km time, minutes') as HTMLInputElement).value).toBe(
      '50',
    );
  });
});

describe('Swim pace (CSS)', () => {
  it('calculates CSS pace and swim zones', () => {
    render(<SwimCssCalculator />);
    type('400 m time, minutes', '6');
    type('400 m time, seconds', '40');
    type('200 m time, minutes', '3');
    type('200 m time, seconds', '10');

    expect(screen.getByText('1:45 /100 m')).toBeDefined();
    const table = screen.getByRole('table', { name: 'Your swim zones' });
    expect(within(table).getByText('2:00 /100 m or slower')).toBeDefined();
  });

  it('explains when the 400 m pace is not slower than the 200 m pace', () => {
    render(<SwimCssCalculator />);
    const min400 = screen.getByLabelText('400 m time, minutes');
    fireEvent.change(min400, { target: { value: '6' } });
    type('200 m time, minutes', '3');
    type('200 m time, seconds', '10');
    fireEvent.blur(min400);
    expect(
      screen.getByText(
        'Your 400 m pace must be slower than your 200 m pace. Please check both times.',
      ),
    ).toBeDefined();
  });
});
