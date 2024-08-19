import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

type FlashcardStatsProps = {
  flashcards: Flashcard[];
};

const FlashcardStats: React.FC<FlashcardStatsProps> = ({ flashcards }) => {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Flashcard Statistics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {flashcards.map((flashcard) => (
          <Card key={flashcard.id}>
            <CardHeader>
              <CardTitle className="text-lg">{flashcard.front}</CardTitle>
            </CardHeader>
            <CardContent>
              <p><strong>State:</strong> {flashcard.state}</p>
              <p><strong>Interval:</strong> {flashcard.interval} days</p>
              <p><strong>Ease Factor:</strong> {flashcard.easeFactor.toFixed(2)}</p>
              <p><strong>Due Date:</strong> {flashcard.dueDate.toLocaleDateString()}</p>
              <p><strong>Last Reviewed:</strong> {flashcard.lastReviewed ? flashcard.lastReviewed.toLocaleDateString() : 'Never'}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default FlashcardStats;