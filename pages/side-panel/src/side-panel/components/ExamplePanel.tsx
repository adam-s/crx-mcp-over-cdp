import React from 'react';
import {
  Button,
  Text,
  makeStyles,
  tokens,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
  TableCellLayout,
  Badge,
} from '@fluentui/react-components';
import { InfoRegular, SettingsRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    padding: '10px 0',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    padding: '0 10px',
    fontSize: '14px',
    fontWeight: tokens.fontWeightSemibold,
  },
  controls: {
    marginBottom: '12px',
  },
  buttonContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    padding: '0 10px',
  },
  actionButton: {
    minWidth: 'unset',
    height: '28px',
    padding: '0 12px',
    fontSize: '12px',
    flex: '1 1 auto',
  },
  infoContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 10px 8px 10px',
    fontSize: '12px',
  },
  infoValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  tableContainer: {
    flex: '1 1 auto',
    overflow: 'auto',
    borderRadius: tokens.borderRadiusSmall,
    margin: '0 10px 0 10px',
    '&::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: tokens.colorNeutralBackground3,
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: tokens.colorNeutralForeground3,
      borderRadius: '4px',
      '&:hover': {
        background: tokens.colorNeutralForeground2,
      },
    },
    scrollbarWidth: 'thin',
    scrollbarColor: `${tokens.colorNeutralForeground3} ${tokens.colorNeutralBackground3}`,
  },
  table: {
    width: '100%',
    tableLayout: 'auto',
  },
  headerCell: {
    padding: '2px 8px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: 'nowrap',
  },
  cell: {
    padding: '2px 8px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  emptyCell: {
    padding: '2px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
  statusActive: {
    color: tokens.colorPaletteGreenForeground1,
  },
  statusInactive: {
    color: tokens.colorNeutralForeground3,
  },
});

interface ExampleItem {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  value: number;
}

const exampleData: ExampleItem[] = [
  { id: '1', name: 'Feature A', status: 'active', value: 42 },
  { id: '2', name: 'Feature B', status: 'inactive', value: 18 },
  { id: '3', name: 'Feature C', status: 'active', value: 67 },
];

export const ExamplePanel: React.FC = () => {
  const styles = useStyles();

  const columns = [
    { columnKey: 'name', label: 'Name' },
    { columnKey: 'status', label: 'Status' },
    { columnKey: 'value', label: 'Value' },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <InfoRegular />
        <Text>Example Panel</Text>
      </div>

      <div className={styles.infoContainer}>
        <Text>Total Items:</Text>
        <Text className={styles.infoValue}>{exampleData.length}</Text>
      </div>

      <div className={styles.controls}>
        <div className={styles.buttonContainer}>
          <Button appearance="primary" className={styles.actionButton} icon={<SettingsRegular />}>
            Configure
          </Button>
          <Button appearance="secondary" className={styles.actionButton}>
            Reset
          </Button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <Table className={styles.table} aria-label="Example Data Table">
          <TableHeader>
            <TableRow>
              {columns.map(column => (
                <TableHeaderCell key={column.columnKey} className={styles.headerCell}>
                  {column.label}
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {exampleData.length > 0 ? (
              exampleData.map((item: ExampleItem) => (
                <TableRow key={item.id}>
                  <TableCell className={styles.cell}>
                    <TableCellLayout>{item.name}</TableCellLayout>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <TableCellLayout>
                      <Badge
                        appearance={item.status === 'active' ? 'filled' : 'outline'}
                        color={item.status === 'active' ? 'success' : 'subtle'}>
                        {item.status}
                      </Badge>
                    </TableCellLayout>
                  </TableCell>
                  <TableCell className={styles.cell}>
                    <TableCellLayout
                      className={
                        item.status === 'active' ? styles.statusActive : styles.statusInactive
                      }>
                      {item.value}
                    </TableCellLayout>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className={styles.emptyCell}>
                  No items available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
