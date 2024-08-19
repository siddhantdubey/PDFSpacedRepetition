import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import FlashcardStats from './FlashcardStats';

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

type FlashcardCarouselProps = {
  flashcards: Flashcard[];
  onBack: () => void;
  onUpdate: (updatedFlashcards: Flashcard[]) => void;
};

const FlashcardCarousel: React.FC<FlashcardCarouselProps> = ({ flashcards: initialFlashcards, onBack, onUpdate }) => {
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialFlashcards);
  const [showBack, setShowBack] = useState<boolean[]>(initialFlashcards.map(() => false));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    setFlashcards(initialFlashcards);
  }, [initialFlashcards]);

  useEffect(() => {
    // Save flashcards to local storage whenever they change
    localStorage.setItem('flashcards', JSON.stringify(flashcards));
    onUpdate(flashcards);
  }, [flashcards, onUpdate]);

  const toggleCardSide = () => {
    setShowBack((prev) => {
      const newState = [...prev];
      newState[currentIndex] = !newState[currentIndex];
      return newState;
    });
  };

  const calculateNextState = (card: Flashcard, response: 'again' | 'hard' | 'good' | 'easy'): Flashcard => {
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

  const handleReview = (response: 'again' | 'hard' | 'good' | 'easy') => {
    setFlashcards((prevFlashcards) => {
      const updatedFlashcards = prevFlashcards.map((card, index) => 
        index === currentIndex ? calculateNextState(card, response) : card
      );
      return updatedFlashcards;
    });

    setShowBack((prev) => {
      const newState = [...prev];
      newState[currentIndex] = false;
      return newState;
    });
    setCurrentIndex((prev) => (prev + 1) % flashcards.length);
  };

  const renderLatex = (text: string) => {
    return text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/).map((part, index) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        return <BlockMath key={index}>{part.slice(2, -2)}</BlockMath>;
      } else if (part.startsWith('$') && part.endsWith('$')) {
        return <InlineMath key={index}>{part.slice(1, -1)}</InlineMath>;
      }
      return part;
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-4xl p-6 bg-white rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <Button variant="outline" onClick={onBack}>
            Back to PDF
          </Button>
          <Button variant="outline" onClick={() => setShowStats(!showStats)}>
            {showStats ? 'Show Flashcards' : 'Show Stats'}
          </Button>
          {!showStats && (
            <span className="text-sm font-medium">
              Card {currentIndex + 1} of {flashcards.length}
            </span>
          )}
        </div>

        {showStats ? (
          <FlashcardStats flashcards={flashcards} />
        ) : (
          <>
            <Carousel className="w-full" setApi={(api) => {
              api?.on('select', () => {
                setShowBack((prev) => prev.map(() => false));
              });
            }}>
              <CarouselContent>
                {flashcards.map((flashcard, index) => (
                  <CarouselItem key={index}>
                    <div className="p-1">
                      <Card>
                        <CardContent 
                          className="flex aspect-[2/1] items-center justify-center p-6 cursor-pointer"
                          onClick={toggleCardSide}
                        >
                          <div className="text-2xl font-semibold text-center">
                            {renderLatex(showBack[index] ? flashcard.back : flashcard.front)}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>

            {showBack[currentIndex] && (
              <div className="flex justify-center mt-4 space-x-2">
                <Button onClick={() => handleReview('again')} variant="destructive">Again</Button>
                <Button onClick={() => handleReview('hard')} variant="outline">Hard</Button>
                <Button onClick={() => handleReview('good')} variant="default">Good</Button>
                <Button onClick={() => handleReview('easy')} variant="secondary">Easy</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FlashcardCarousel;