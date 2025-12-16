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

describe('App - Debounce Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Timer Behavior', () => {
    it('should NOT trigger debounced search immediately after typing', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'test');

      // Should still be called with empty search initially
      expect(mockUseMatters).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '',
        })
      );
    });

    it('should trigger debounced search after 500ms delay', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'test');

      // Wait for debounce to complete
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
    });

    it('should cancel previous timer when user types again within 500ms', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);

      // Type "test"
      await user.type(input, 'test');

      // Wait only 200ms (not enough to trigger debounce)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Type more characters (this should cancel the first timeout)
      await user.type(input, 'ing');

      // Wait for debounce to complete
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'testing',
            })
          );
        },
        { timeout: 1000 }
      );

      // Should NOT have been called with 'test' because timer was cancelled
      const calls = mockUseMatters.mock.calls;
      const searchCalls = calls.filter((call) => call[0].search === 'test');
      expect(searchCalls.length).toBe(0);
    });

    it('should only make one debounced update for rapid consecutive inputs', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);

      // Rapidly type multiple characters
      await user.type(input, 'testing');

      // Wait for debounce to complete
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'testing',
            })
          );
        },
        { timeout: 1000 }
      );

      const calls = mockUseMatters.mock.calls;
      const testingCalls = calls.filter((call) => call[0].search === 'testing');
      // Should only be called once with 'testing' after debounce
      expect(testingCalls.length).toBe(1);
    });
  });

  describe('State Management', () => {
    it('should update search input immediately on input change', async () => {
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(
        /Search across all fields/i
      ) as HTMLInputElement;

      await user.type(input, 'immediate');

      // Input value should update immediately
      expect(input.value).toBe('immediate');
    });

    it('should update debouncedSearch state only after 500ms', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'delayed');

      // Before 500ms - should still be empty
      expect(mockUseMatters).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '',
        })
      );

      // After 500ms - should be updated
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              search: 'delayed',
            })
          );
        },
        { timeout: 1000 }
      );
    });

    it('should preserve search value while debouncing', async () => {
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(
        /Search across all fields/i
      ) as HTMLInputElement;

      await user.type(input, 'preserve');

      // Before debounce completes, value should still be in input
      expect(input.value).toBe('preserve');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Value should still be preserved
      expect(input.value).toBe('preserve');
    });
  });

  describe('Pagination Reset', () => {
    it('should reset page to 1 when search term changes', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      // Type in search
      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'search term');

      // Wait for debounce and verify page reset
      await waitFor(
        () => {
          expect(mockUseMatters).toHaveBeenCalledWith(
            expect.objectContaining({
              page: 1,
              search: 'search term',
            })
          );
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Cleanup', () => {
    it('should clear timeout on component unmount', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      const { unmount } = render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);
      await user.type(input, 'cleanup test');

      // Unmount before timer completes
      unmount();

      // Wait longer than debounce period
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Should not have been called with 'cleanup test' because component unmounted
      const calls = mockUseMatters.mock.calls;
      const cleanupCalls = calls.filter(
        (call) => call[0].search === 'cleanup test'
      );
      expect(cleanupCalls.length).toBe(0);
    });

    it('should clear pending timeout when new input arrives', async () => {
      const mockUseMatters = vi.mocked(useMatters);
      const user = userEvent.setup();

      render(<App />);

      const input = screen.getByPlaceholderText(/Search across all fields/i);

      // First input
      await user.type(input, 'first');

      // Wait 200ms (not enough for debounce)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second input (should clear first timeout)
      await user.clear(input);
      await user.type(input, 'second');

      // Wait for debounce to complete
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

      // Should only be called with 'second', not 'first'
      const calls = mockUseMatters.mock.calls;
      const firstCalls = calls.filter((call) => call[0].search === 'first');
      const secondCalls = calls.filter((call) => call[0].search === 'second');

      expect(firstCalls.length).toBe(0);
      expect(secondCalls.length).toBe(1);
    });
  });
});
