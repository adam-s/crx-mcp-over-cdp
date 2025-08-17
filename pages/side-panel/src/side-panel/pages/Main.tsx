import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { BabyAnimalImageSearch } from '../components/BabyAnimalImageSearch';

// Define breakpoints (consider moving to a shared constants file)
const BREAKPOINTS = {
  MOBILE: '300px',
  TABLET: '600px',
  DESKTOP: '900px',
} as const;

const useStyles = makeStyles({
  root: {
    height: '100%',
    display: 'grid',
    gap: '10px',
    gridTemplateRows: '1fr',
    gridTemplateColumns: '1fr',
    [`@media (min-width: ${BREAKPOINTS.TABLET})`]: {
      gridTemplateColumns: '1fr 1fr',
    },
    [`@media (min-width: ${BREAKPOINTS.DESKTOP})`]: {
      gridTemplateColumns: '1fr 1fr 1fr',
    },
  },
});

export const Main: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="main" className={styles.root}>
      <BabyAnimalImageSearch />
    </div>
  );
};
