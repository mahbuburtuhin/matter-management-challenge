import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatterTable } from '../MatterTable';
import { Matter } from '../../types/matter';

describe('MatterTable', () => {
  const mockOnSort = vi.fn();

  const createMockMatter = (overrides?: Partial<Matter>): Matter => ({
    id: '1',
    boardId: 'board-1',
    fields: {
      subject: {
        fieldId: 'f1',
        fieldName: 'subject',
        fieldType: 'text',
        value: 'Test Matter',
        displayValue: 'Test Matter',
      },
      'Case Number': {
        fieldId: 'f2',
        fieldName: 'Case Number',
        fieldType: 'text',
        value: 'CASE-001',
        displayValue: 'CASE-001',
      },
      Status: {
        fieldId: 'f3',
        fieldName: 'Status',
        fieldType: 'status',
        value: { statusId: 's1', groupName: 'In Progress' },
        displayValue: 'In Progress',
      },
      'Assigned To': {
        fieldId: 'f4',
        fieldName: 'Assigned To',
        fieldType: 'user',
        value: {
          id: 1,
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
          displayName: 'John Doe',
        },
        displayValue: 'John Doe',
      },
      Priority: {
        fieldId: 'f5',
        fieldName: 'Priority',
        fieldType: 'text',
        value: 'High',
        displayValue: 'High',
      },
      'Contract Value': {
        fieldId: 'f6',
        fieldName: 'Contract Value',
        fieldType: 'currency',
        value: { amount: 50000, currency: 'USD' },
        displayValue: '50,000 USD',
      },
      'Due Date': {
        fieldId: 'f7',
        fieldName: 'Due Date',
        fieldType: 'date',
        value: '2024-12-31',
        displayValue: 'Dec 31, 2024',
      },
      Urgent: {
        fieldId: 'f8',
        fieldName: 'Urgent',
        fieldType: 'boolean',
        value: true,
        displayValue: 'Yes',
      },
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  describe('renderCycleTimeAndSLA', () => {
    it('should render cycle time when available', () => {
      const matter = createMockMatter({
        cycleTime: {
          resolutionTimeMs: 9000000,
          resolutionTimeFormatted: '2h 30m',
          isInProgress: false,
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T02:30:00Z',
        },
      });

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      expect(screen.getByText('2h 30m')).toBeInTheDocument();
    });

    it('should render N/A when cycle time is not available', () => {
      const matter = createMockMatter();

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      const naCells = screen.getAllByText('N/A');
      expect(naCells.length).toBeGreaterThan(0);
    });

    it('should render SLA badge with correct styling for "In Progress"', () => {
      const matter = createMockMatter({
        sla: 'In Progress',
        fields: {
          ...createMockMatter().fields,
          Status: {
            fieldId: 'f3',
            fieldName: 'Status',
            fieldType: 'status',
            value: { statusId: 's1', groupName: 'Done' },
            displayValue: 'Done',
          },
        },
      });

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      const slaBadges = screen.getAllByText('In Progress');
      const slaBadge = slaBadges.find(el => el.classList.contains('px-2'));
      expect(slaBadge).toHaveClass('bg-blue-100', 'text-blue-800');
    });

    it('should render SLA badge with correct styling for "Met"', () => {
      const matter = createMockMatter({
        sla: 'Met',
      });

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      const slaBadge = screen.getByText('Met');
      expect(slaBadge).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('should render SLA badge with correct styling for "Breached"', () => {
      const matter = createMockMatter({
        sla: 'Breached',
      });

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      const slaBadge = screen.getByText('Breached');
      expect(slaBadge).toHaveClass('bg-red-100', 'text-red-800');
    });

    it('should render N/A when SLA is not available', () => {
      const matter = createMockMatter();

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      const naCells = screen.getAllByText('N/A');
      expect(naCells.length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('should render empty state when no matters are provided', () => {
      render(<MatterTable matters={[]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />);

      expect(screen.getByText('No matters found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search criteria.')).toBeInTheDocument();
    });
  });

  describe('table rendering', () => {
    it('should render all column headers', () => {
      const matter = createMockMatter();

      render(
        <MatterTable matters={[matter]} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      expect(screen.getByText('Subject')).toBeInTheDocument();
      expect(screen.getByText('Case Number')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Assigned To')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByText('Contract Value')).toBeInTheDocument();
      expect(screen.getByText('Due Date')).toBeInTheDocument();
      expect(screen.getByText('Urgent')).toBeInTheDocument();
      expect(screen.getByText('Resolution Time')).toBeInTheDocument();
      expect(screen.getByText('SLA')).toBeInTheDocument();
    });

    it('should render multiple matters', () => {
      const matters = [
        createMockMatter({ id: '1' }),
        createMockMatter({ id: '2' }),
        createMockMatter({ id: '3' }),
      ];

      const { container } = render(
        <MatterTable matters={matters} sortBy="subject" sortOrder="asc" onSort={mockOnSort} />
      );

      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
    });
  });
});
