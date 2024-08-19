import { useState, useEffect } from 'react';

type Flashcard = {
  id: string;
  front: string;
  back: string;
  state: 'new' | 'learning' | 'review' | 'relearning';
  interval: number;
  easeFactor: number;
  dueDate: Date;
  lastReviewed: Date | null;
};

export function SpacedRepetitionManager() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);

  useEffect(() => {
    // Load flashcards from local storage
    const savedFlashcards = localStorage.getItem('flashcards');
    if (savedFlashcards) {
      setFlashcards(JSON.parse(savedFlashcards));
    }
  }, []);

  useEffect(() => {
    // Save flashcards to local storage whenever they change
    localStorage.setItem('flashcards', JSON.stringify(flashcards));
  }, [flashcards]);

  const addFlashcard = (front: string, back: string) => {
    const newFlashcard: Flashcard = {
      id: Date.now().toString(),
      front,
      back,
      state: 'new',
      interval: 0,
      easeFactor: 2.5,
      dueDate: new Date(),
      lastReviewed: null,
    };
    setFlashcards([...flashcards, newFlashcard]);
  };

  const reviewFlashcard = (id: string, response: 'again' | 'hard' | 'good' | 'easy') => {
    setFlashcards(flashcards.map(card => {
      if (card.id === id) {
        return calculateNextState(card, response);
      }
      return card;
    }));
  };

  const calculateNextState = (card: Flashcard, response: 'again' | 'hard' | 'good' | 'easy'): Flashcard => {
    // Implement spaced repetition algorithm here
    // This is a simplified version and should be expanded
    let newCard = { ...card };
    newCard.lastReviewed = new Date();

    switch (response) {
      case 'again':
        newCard.state = 'learning';
        newCard.interval = 1;
        newCard.easeFactor = Math.max(1.3, newCard.easeFactor - 0.2);
        break;
      case 'hard':
        newCard.interval *= 1.2;
        newCard.easeFactor = Math.max(1.3, newCard.easeFactor - 0.15);
        break;
      case 'good':
        newCard.interval *= newCard.easeFactor;
        break;
      case 'easy':
        newCard.interval *= newCard.easeFactor * 1.3;
        newCard.easeFactor += 0.15;
        break;
    }

    newCard.dueDate = new Date(Date.now() + newCard.interval * 24 * 60 * 60 * 1000);
    return newCard;
  };

  const getDueFlashcards = () => {
    const now = new Date();
    return flashcards.filter(card => card.dueDate <= now);
  };

  const getFlashcardById = (id: string) => {
    return flashcards.find(card => card.id === id) || null;
  };

  return {
    flashcards,
    addFlashcard,
    reviewFlashcard,
    getDueFlashcards,
    getFlashcardById,
  };
}