import React, { useState, FormEvent } from 'react';
import {
  Button,
  Input,
  Text,
  MessageBar,
  Spinner,
  makeStyles,
  tokens,
  type InputOnChangeData,
} from '@fluentui/react-components';
import { SearchRegular, ImageRegular } from '@fluentui/react-icons';
import { useBabyElephantImage } from '../hooks/useBabyElephantImage';

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
  inputContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    padding: '0 10px',
  },
  input: {
    flex: '1 1 auto',
    minWidth: 0,
    height: '28px',
    fontSize: '12px',
  },
  buttonContainer: {
    display: 'flex',
    gap: '4px',
    padding: '0 10px',
  },
  searchButton: {
    minWidth: 'unset',
    height: '28px',
    padding: '0 8px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    fontSize: '11px',
    '&[disabled]': {
      backgroundColor: tokens.colorNeutralBackground2,
      color: tokens.colorNeutralForeground4,
    },
  },
  messageContainer: {
    padding: '0 10px',
    marginBottom: '8px',
  },
  resultContainer: {
    flex: '1 1 auto',
    overflow: 'auto',
    padding: '0 10px',
    borderRadius: tokens.borderRadiusSmall,
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
  resultInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
    fontSize: '12px',
    fontWeight: tokens.fontWeightSemibold,
  },
  urlList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  urlItem: {
    padding: '6px 8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
    fontSize: '11px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  urlLink: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    wordBreak: 'break-all',
    fontSize: '11px',
    ':hover': {
      textDecoration: 'underline',
    },
  },
});

export const BabyAnimalImageSearch: React.FC = () => {
  const [animalName, setAnimalName] = useState('');
  const [activeButton, setActiveButton] = useState<'v1' | 'v2' | null>(null);
  const styles = useStyles();

  // Use the enhanced hook controller
  const { isLoading, result, error, searchBabyAnimalImages, searchBabyAnimalImagesV2, clearError } =
    useBabyElephantImage();

  const handleAnimalInputChange = (
    _event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ) => {
    setAnimalName(data.value);
    // Clear error when user starts typing
    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveButton('v1');
    await searchBabyAnimalImages(animalName);
    setActiveButton(null);
  };

  const handleSubmitV2 = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveButton('v2');
    await searchBabyAnimalImagesV2(animalName);
    setActiveButton(null);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <ImageRegular />
        <Text>Baby Animal Search</Text>
      </div>

      <form onSubmit={handleSubmit} className={styles.controls}>
        <div className={styles.inputContainer}>
          <Input
            id="animal-name-input"
            type="text"
            value={animalName}
            onChange={handleAnimalInputChange}
            placeholder="elephant, cat, duck..."
            disabled={isLoading}
            className={styles.input}
          />
        </div>

        <div className={styles.buttonContainer}>
          <Button
            type="submit"
            disabled={isLoading || !animalName.trim()}
            appearance="primary"
            className={styles.searchButton}
            icon={isLoading && activeButton === 'v1' ? <Spinner size="tiny" /> : <SearchRegular />}>
            {isLoading && activeButton === 'v1' ? 'Searching...' : 'Search (V1)'}
          </Button>
          <Button
            type="button"
            disabled={isLoading || !animalName.trim()}
            appearance="secondary"
            className={styles.searchButton}
            icon={isLoading && activeButton === 'v2' ? <Spinner size="tiny" /> : <SearchRegular />}
            onClick={() =>
              handleSubmitV2({ preventDefault: () => {} } as FormEvent<HTMLFormElement>)
            }>
            {isLoading && activeButton === 'v2' ? 'Searching...' : 'Search (V2)'}
          </Button>
        </div>
      </form>

      {error && (
        <div className={styles.messageContainer}>
          <MessageBar intent="error">❌ {error}</MessageBar>
        </div>
      )}

      {result && (
        <div className={styles.resultContainer}>
          <div className={styles.resultInfo}>
            <Text>Status:</Text>
            <Text
              style={{
                color: result.success
                  ? tokens.colorPaletteGreenForeground1
                  : tokens.colorPaletteRedForeground1,
              }}>
              {result.success ? '✅ Success' : '❌ Failed'}
            </Text>
          </div>
        </div>
      )}
    </div>
  );
};
