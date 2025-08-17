import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { ScrollablePanel } from '../components/Panel';
import { BabyAnimalImageSearch } from '../components/BabyAnimalImageSearch';

const useStyles = makeStyles({
  root: {
    height: '100%',
    width: '100%',
  },
});

export const SearchPage: React.FC = () => {
  const styles = useStyles();

  return (
    <div data-test-id="search-page" className={styles.root}>
      <ScrollablePanel>
        <BabyAnimalImageSearch />
      </ScrollablePanel>
    </div>
  );
};
