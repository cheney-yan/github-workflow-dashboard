import { render, screen, waitFor } from '@testing-library/react';
import { InsecureContextBanner } from '../src/components/insecure-context-banner';

describe('insecure context banner', () => {
  it('warns when served over HTTP', () => {
    render(<InsecureContextBanner protocol="http:" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/insecure connection/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/steal your github token/i);
  });

  it('stays hidden over HTTPS', async () => {
    const { rerender } = render(<InsecureContextBanner protocol="http:" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<InsecureContextBanner protocol="https:" />);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
