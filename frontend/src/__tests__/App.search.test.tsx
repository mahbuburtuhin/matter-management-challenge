import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { useMatters } from '../hooks/useMatters';

// Mock the useMatters hook
vi.mock('../hooks/useMatters', () => ({
  useMatters: vi.fn(() => ({
    data: [],
    total: 0,
    totalPages: 0,
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

describe('App - Search Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End Search Flow', () => {
    it('should trigger API call with correct search term after typing and waiting 500ms', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'contract');

      // Before debounce completes
      expect(mockUseMatters).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '',
        })
      );

      // Wait for debounce to complete
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'contract',
            })
          );
        },
        { timeout: 1000 }
      );
    });

    it('should only trigger ONE API call after multiple rapid keystrokes', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);

      // Rapidly type
      await user.type(input, 'quick');

      // Wait for debounce to complete
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'quick',
            })
          );
        },
        { timeout: 1000 }
      );

      const calls = mockUseMatters.mock.calls;
      const quickCalls = calls.filter((call) => call[0].search === 'quick');
      // Should only be called once with final value
      expect(quickCalls.length).toBe(1);
    });

    it('should trigger API call with empty search parameter when clearing', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      // First, type something
      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'test');

      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'test',
            })
          );
        },
        { timeout: 1000 }
      );

      // Clear using the clear button
      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      // Wait for debounce
      await waitFor(
        () => {
          const calls = mockUseMatters.mock.calls;
          const lastCall = calls[calls.length - 1];
          expect(lastCall[0].search).toBe('');
        },
        { timeout: 1000 }
      );
    });

    it('should trigger separate API calls for different search terms', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);

      // First search
      await user.type(input, 'first');

      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'first',
            })
          );
        },
        { timeout: 1000 }
      );

      // Clear and type new search
      await user.clear(input);
      await user.type(input, 'second');

      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'second',
            })
          );
        },
        { timeout: 1000 }
      );
    });
  });

  describe('API Integration', () => {
    it('should pass debouncedSearch value (not immediate search) to useMatters hook', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'debounced');

      // Immediately after typing, should still use empty search
      const immediateCalls = mockUseMatters.mock.calls.filter(
        (call) => call[0].search === 'debounced'
      );
      expect(immediateCalls.length).toBe(0);

      // After debounce period
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'debounced',
            })
          );
        },
        { timeout: 1000 }
      );
    });

    it('should call useMatters with correct parameters including search', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'complete params');

      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              page: 1,
              limit: 25,
              sortBy: 'created_at',
              sortOrder: 'desc',
              search: 'complete params',
            })
          );
        },
        { timeout: 1000 }
      );
    });

    it('should not call API until debounce completes', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'waiting');

      // Check calls before debounce (immediately after typing)
      const beforeCalls = mockUseMatters.mock.calls.filter(
        (call) => call[0].search === 'waiting'
      );
      expect(beforeCalls.length).toBe(0);

      // After debounce completes
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'waiting',
            })
          );
        },
        { timeout: 1000 }
      );
    });
  });

  describe('User Experience', () => {
    it('should show immediate feedback in SearchBar (value updates instantly)', async () => {
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(
        /Search across all fields/i
      ) as HTMLInputElement;

      await user.type(input, 'instant');

      // Input should show value immediately, before debounce
      expect(input.value).toBe('instant');
    });

    it('should show loading state after debounce completes', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      // Initially not loading
      mockUseMatters.mockReturnValue({
        data: [],
        total: 0,
        totalPages: 0,
        loading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { rerender } = render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'loading');

      // Simulate loading state after debounce
      await new Promise((resolve) => setTimeout(resolve, 600));

      mockUseMatters.mockReturnValue({
        data: [],
        total: 0,
        totalPages: 0,
        loading: true,
        error: null,
        refetch: vi.fn(),
      });

      rerender(<App />);

      // Should show loading spinner
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should clear button work and trigger new debounced search', async () => {
      const user = userEvent.setup();
      const mockUseMatters = vi.mocked(useMatters);

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);

      // Type and wait for debounce
      await user.type(input, 'clear me');

      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'clear me',
            })
          );
        },
        { timeout: 1000 }
      );

      // Click clear button
      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      // Input should be cleared immediately
      expect(input).toHaveValue('');

      // Wait for debounce
      await waitFor(
        () => {
          const calls = mockUseMatters.mock.calls;
          const lastCall = calls[calls.length - 1];
          expect(lastCall[0].search).toBe('');
        },
        { timeout: 1000 }
      );
    });
  });
});
