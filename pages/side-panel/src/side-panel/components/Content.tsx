import React from 'react';
import { makeStyles } from '@fluentui/react-components';
import { Panel } from './Panel';
import { Main } from '../pages/Main';
import { SearchPage } from '../pages/SearchPage';
import { useTabNavigationContext } from '../context/TabNavigationContext';

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
  deactivated: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1 0 auto',
  },
  deactivatedText: {
    width: '100%',
    textAlign: 'center',
    padding: '16px',
    lineHeight: '1.5',
    textWrap: 'balance',
    '@media (max-width: 400px)': {
      fontSize: '14px',
      padding: '12px',
    },
    '@media (max-width: 280px)': {
      fontSize: '12px',
      padding: '8px',
      lineHeight: '1.4',
    },
  },
  pageContainer: {
    width: '100%',
    height: '100%',
    display: 'none',
  },
  pageVisible: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
});

export const Content: React.FC = () => {
  const styles = useStyles();
  const { currentPage } = useTabNavigationContext();

  // For now, we'll assume the panel is always attached since this is a Chrome extension
  const isAttached = true;

  return (
    <div className={styles.root}>
      {!isAttached ? (
        <Panel className={styles.deactivated}>
          <div className={styles.deactivatedText}>
            Please activate the Chrome extension to use the side panel.
          </div>
        </Panel>
      ) : (
        <>
          {currentPage === 'main' && (
            <div className={styles.pageVisible}>
              <Main />
            </div>
          )}
          {currentPage === 'search' && (
            <div className={styles.pageVisible}>
              <SearchPage />
            </div>
          )}
        </>
      )}
    </div>
  );
};
