import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { ScrollablePanel } from '../components/Panel';
import { BabyAnimalImageSearch } from '../components/BabyAnimalImageSearch';
import { ExamplePanel } from '../components/ExamplePanel';

// Define breakpoints consistent with the design system
const BREAKPOINTS = {
  MOBILE: '300px',
  TABLET: '680px',
  DESKTOP: '900px',
} as const;

const useStyles = makeStyles({
  root: {
    flexBasis: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
    gridTemplateColumns: '1fr',
    height: '100%',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  panel: {
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  secondPanel: {
    display: 'none',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      display: 'block',
    },
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
});

export const Main: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="main" className={styles.root}>
      {/* First panel: always visible */}
      <div className={styles.panel}>
        <ScrollablePanel>
          <BabyAnimalImageSearch />
        </ScrollablePanel>
      </div>
      {/* Second panel: only visible on wide screens */}
      <div className={styles.secondPanel}>
        <ScrollablePanel>
          <ExamplePanel />
        </ScrollablePanel>
      </div>
    </div>
  );
};
