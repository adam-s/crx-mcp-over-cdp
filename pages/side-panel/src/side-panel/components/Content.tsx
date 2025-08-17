import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { BabyAnimalImageSearch } from './BabyAnimalImageSearch';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    padding: '10px',
    boxSizing: 'border-box',
    flex: '1 0 auto',
    position: 'relative',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
  },
});

export const Content: React.FC = () => {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <BabyAnimalImageSearch />
    </div>
  );
};
