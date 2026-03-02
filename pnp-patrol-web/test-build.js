// Test build compilation
import React from 'react';
import { render } from '@testing-library/react';
import LiveMap from '../src/components/LiveMap';

test('LiveMap renders without crashing', () => {
  render(<LiveMap />);
});
