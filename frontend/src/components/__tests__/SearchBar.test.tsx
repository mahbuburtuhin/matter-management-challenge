import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '../SearchBar';

describe('SearchBar', () => {
  describe('Rendering', () => {
    it('should render input with default placeholder text', () => {
      render(<SearchBar value="" onChange={vi.fn()} />);

      const input = screen.getByPlaceholderText('Search matters...');
      expect(input).toBeInTheDocument();
    });

    it('should render input with custom placeholder when provided', () => {
      render(
        <SearchBar
          value=""
          onChange={vi.fn()}
          placeholder="Custom placeholder"
        />
      );

      const input = screen.getByPlaceholderText('Custom placeholder');
      expect(input).toBeInTheDocument();
    });

    it('should render search icon', () => {
      const { container } = render(<SearchBar value="" onChange={vi.fn()} />);

      // Search icon is the first SVG element
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should NOT show clear button when value is empty', () => {
      render(<SearchBar value="" onChange={vi.fn()} />);

      const clearButton = screen.queryByLabelText('Clear search');
      expect(clearButton).not.toBeInTheDocument();
    });

    it('should show clear button when value is non-empty', () => {
      render(<SearchBar value="test query" onChange={vi.fn()} />);

      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('should display the current value in the input', () => {
      render(<SearchBar value="test search" onChange={vi.fn()} />);

      const input = screen.getByDisplayValue('test search');
      expect(input).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onChange when user types in input', async () => {
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      render(<SearchBar value="" onChange={mockOnChange} />);

      const input = screen.getByPlaceholderText('Search matters...');
      await user.type(input, 'a');

      expect(mockOnChange).toHaveBeenCalled();
    });

    it('should call onChange with correct value on input change', async () => {
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      render(<SearchBar value="" onChange={mockOnChange} />);

      const input = screen.getByPlaceholderText('Search matters...');
      await user.type(input, 'a');

      // Each keystroke triggers onChange with the character from the event
      expect(mockOnChange).toHaveBeenCalledWith('a');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should call onChange with empty string when clear button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnChange = vi.fn();

      render(<SearchBar value="existing text" onChange={mockOnChange} />);

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      expect(mockOnChange).toHaveBeenCalledWith('');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should update input value when value prop changes', () => {
      const { rerender } = render(<SearchBar value="" onChange={vi.fn()} />);

      let input = screen.getByPlaceholderText('Search matters...');
      expect(input).toHaveValue('');

      rerender(<SearchBar value="new value" onChange={vi.fn()} />);

      input = screen.getByPlaceholderText('Search matters...');
      expect(input).toHaveValue('new value');
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on input for screen readers', () => {
      render(<SearchBar value="" onChange={vi.fn()} />);

      const input = screen.getByLabelText('Search matters');
      expect(input).toBeInTheDocument();
    });

    it('should have aria-label on clear button for screen readers', () => {
      render(<SearchBar value="test" onChange={vi.fn()} />);

      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });
  });
});
