import { fireEvent, render, screen } from '@testing-library/react-native';

import { HrZonesScreen } from '../screens/hr-zones-screen';
import { PaceScreen } from '../screens/pace-screen';
import { SwimCssScreen } from '../screens/swim-css-screen';
import { Zone2Screen } from '../screens/zone2-screen';

describe('Heart rate zones', () => {
  it('shows %HRmax zones with an estimated HRmax after entering the age', async () => {
    await render(<HrZonesScreen />);
    expect(screen.queryByText('Your zones')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Age'), '30');

    expect(screen.getByText('Your zones')).toBeOnTheScreen();
    expect(screen.getByText('187 bpm')).toBeOnTheScreen();
    expect(screen.getByText('Estimate')).toBeOnTheScreen();
    expect(screen.getByText('112–130 bpm')).toBeOnTheScreen();
    expect(screen.getByText('168–187 bpm')).toBeOnTheScreen();
  });

  it('switches to Karvonen automatically once resting HR is entered', async () => {
    await render(<HrZonesScreen />);
    await fireEvent.changeText(screen.getByLabelText('Age'), '30');
    await fireEvent.changeText(screen.getByLabelText('Resting heart rate (optional)'), '60');

    expect(screen.getByLabelText('Resting heart rate')).toBeOnTheScreen();
    expect(screen.getByText('136–148 bpm')).toBeOnTheScreen();
  });

  it('shows open-ended LTHR zones', async () => {
    await render(<HrZonesScreen />);
    await fireEvent.press(screen.getByText('LTHR'));
    await fireEvent.changeText(screen.getByLabelText('Threshold heart rate (LTHR)'), '170');

    expect(screen.getByText('up to 144 bpm')).toBeOnTheScreen();
    expect(screen.getByText('170+ bpm')).toBeOnTheScreen();
    expect(screen.queryByText('Estimate')).toBeNull();
  });

  it('shows range errors only after leaving the field', async () => {
    await render(<HrZonesScreen />);
    const age = screen.getByLabelText('Age');
    await fireEvent.changeText(age, '5');
    expect(screen.queryByText('Enter a value between 10 and 100.')).toBeNull();

    await fireEvent(age, 'blur');
    expect(screen.getByText('Enter a value between 10 and 100.')).toBeOnTheScreen();
    expect(screen.queryByText('Your zones')).toBeNull();
  });

  it('rejects non-numeric input immediately', async () => {
    await render(<HrZonesScreen />);
    await fireEvent.changeText(screen.getByLabelText('Age'), '3a');
    expect(screen.getByText('Enter a whole number.')).toBeOnTheScreen();
  });
});

describe('Zone 2 calculator', () => {
  it('shows the Zone 2 range and explains why it matters', async () => {
    await render(<Zone2Screen />);
    expect(screen.getByText('Why Zone 2 matters')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Age'), '30');
    expect(screen.getByText('Your Zone 2')).toBeOnTheScreen();
    // Headline result plus the highlighted row in the table.
    expect(screen.getAllByText('112–130 bpm')).toHaveLength(2);
  });
});

describe('Pace & race predictor', () => {
  it('predicts race times and pace zones from a 10 km result', async () => {
    await render(<PaceScreen />);
    await fireEvent.changeText(screen.getByLabelText('Your 10 km time, minutes'), '50');

    // Race pace headline and the 10 km row of the predictions table.
    expect(screen.getAllByText('5:00 /km')).toHaveLength(2);
    expect(screen.getByText('23:59')).toBeOnTheScreen();
    expect(screen.getByText('1:50:19')).toBeOnTheScreen();
    expect(screen.getByText('6:31 /km or slower')).toBeOnTheScreen();
  });

  it('rejects seconds of 60 or more', async () => {
    await render(<PaceScreen />);
    await fireEvent.changeText(screen.getByLabelText('Your 10 km time, minutes'), '50');
    await fireEvent.changeText(screen.getByLabelText('Your 10 km time, seconds'), '75');
    expect(screen.getByText('Minutes and seconds must be below 60.')).toBeOnTheScreen();
  });

  it('flags an unrealistic time with formatted limits', async () => {
    await render(<PaceScreen />);
    await fireEvent.press(screen.getByText('5 km'));
    const minutes = screen.getByLabelText('Your 5 km time, minutes');
    await fireEvent.changeText(minutes, '9');
    await fireEvent(minutes, 'blur');
    expect(
      screen.getByText(
        'This time looks unrealistic for the distance. Enter a time between 12:30 and 1:15:00.',
      ),
    ).toBeOnTheScreen();
  });
});

describe('Swim pace (CSS)', () => {
  it('calculates CSS pace and swim zones', async () => {
    await render(<SwimCssScreen />);
    expect(screen.getByText('How to do the CSS test')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('400 m time, minutes'), '6');
    await fireEvent.changeText(screen.getByLabelText('400 m time, seconds'), '40');
    await fireEvent.changeText(screen.getByLabelText('200 m time, minutes'), '3');
    await fireEvent.changeText(screen.getByLabelText('200 m time, seconds'), '10');

    expect(screen.getByText('1:45 /100 m')).toBeOnTheScreen();
    expect(screen.getByText('2:00 /100 m or slower')).toBeOnTheScreen();
  });

  it('explains when the 400 m pace is not slower than the 200 m pace', async () => {
    await render(<SwimCssScreen />);
    const min400 = screen.getByLabelText('400 m time, minutes');
    await fireEvent.changeText(min400, '6');
    await fireEvent.changeText(screen.getByLabelText('200 m time, minutes'), '3');
    await fireEvent.changeText(screen.getByLabelText('200 m time, seconds'), '10');
    await fireEvent(min400, 'blur');
    expect(
      screen.getByText(
        'Your 400 m pace must be slower than your 200 m pace. Please check both times.',
      ),
    ).toBeOnTheScreen();
  });
});
