import React, { useState, FormEvent } from 'react';
import {
  Button,
  Input,
  Label,
  Text,
  Title3,
  Subtitle2,
  Card,
  CardHeader,
  MessageBar,
  Spinner,
  makeStyles,
  tokens,
  type InputOnChangeData,
} from '@fluentui/react-components';
import { SearchRegular, ImageRegular } from '@fluentui/react-icons';
import { useBabyElephantImage } from '../hooks/useBabyElephantImage';

interface SearchResult {
  success: boolean;
  urls: string[];
  message: string;
}

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingHorizontalL,
    maxWidth: '600px',
    margin: '0 auto',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '10px',
  },
  form: {
    marginTop: tokens.spacingVerticalL,
    marginBottom: tokens.spacingVerticalL,
  },
  inputGroup: {
    marginBottom: tokens.spacingVerticalM,
  },
  buttonGroup: {
    marginTop: tokens.spacingVerticalM,
  },
  resultCard: {
    marginTop: tokens.spacingVerticalL,
  },
  urlList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  urlItem: {
    marginBottom: tokens.spacingVerticalXS,
  },
  urlLink: {
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    wordBreak: 'break-all',
    ':hover': {
      textDecoration: 'underline',
    },
  },
});

export const BabyAnimalImageSearch: React.FC = () => {
  const [animalName, setAnimalName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const babyElephantImageService = useBabyElephantImage();
  const styles = useStyles();

  const handleAnimalInputChange = (
    _event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData,
  ) => {
    setAnimalName(data.value);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!animalName.trim()) {
      setError('Please enter an animal name');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const searchResult = await babyElephantImageService.searchBabyAnimalImages(animalName.trim());
      setResult(searchResult);
    } catch (err) {
      setError(`Failed to search for baby ${animalName} images: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Title3>
        <ImageRegular /> Baby Animal Search
      </Title3>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.content}>
          <Label htmlFor="animal-name-input">Animal Name</Label>
          <Input
            id="animal-name-input"
            type="text"
            value={animalName}
            onChange={handleAnimalInputChange}
            placeholder="e.g., elephant, cat, duck, cow"
            disabled={isLoading}
          />
        </div>

        <div className={styles.buttonGroup}>
          <Button
            type="submit"
            disabled={isLoading || !animalName.trim()}
            appearance="primary"
            icon={<SearchRegular />}>
            {isLoading ? (
              <>
                <Spinner size="tiny" /> Searching...
              </>
            ) : (
              'Search Baby Images'
            )}
          </Button>
        </div>
      </form>

      {error && <MessageBar intent="error">❌ {error}</MessageBar>}

      {result && (
        <Card className={styles.resultCard}>
          <CardHeader>
            <Subtitle2>Search Results</Subtitle2>
          </CardHeader>
          <div>
            <MessageBar intent={result.success ? 'success' : 'error'}>
              {result.success ? '✅' : '❌'} {result.message}
            </MessageBar>

            {result.success && result.urls.length > 0 && (
              <div style={{ marginTop: tokens.spacingVerticalM }}>
                <Subtitle2>URLs:</Subtitle2>
                <ul className={styles.urlList}>
                  {result.urls.map((url, index) => (
                    <li key={index} className={styles.urlItem}>
                      <Text>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.urlLink}>
                          {url}
                        </a>
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
