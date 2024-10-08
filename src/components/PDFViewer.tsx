import { useState, useCallback, useEffect, useRef, MouseEvent } from "react";
import { useResizeObserver } from "@wojtekmaj/react-hooks";
import { pdfjs, Document, Page } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { Virtuoso } from "react-virtuoso";
import FileSelector from "./FileSelector";
import React from "react";
import { PDFDocument, rgb } from "pdf-lib";
import { createPortal } from "react-dom";
import FlashcardCarousel from "./FlashcardCarousel";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const options = {
  cMapUrl: "/cmaps/",
  standardFontDataUrl: "/standard_fonts/",
};

const resizeObserverOptions = {};

type PDFFile = File | null;

type Annotation = {
  front: string;
  back: string;
  position: number;
  yPosition: number;
  text: string;
  x: number;
  width: number;
  height: number;
  rects: { x: number; y: number; width: number; height: number }[];
  id: string;
  state: "new" | "learning" | "review" | "relearning";
  interval: number;
  easeFactor: number;
  dueDate: Date;
  lastReviewed: Date | null;
};

export default function PDFViewer() {
  const [file, setFile] = useState<PDFFile>(null);
  const [numPages, setNumPages] = useState<number>();
  const [containerRef, setContainerRef] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [containerHeight, setContainerHeight] = useState<number>();
  const [scale, setScale] = useState<number>(1);
  const [pdfWidth, setPdfWidth] = useState<number>(0);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const virtuosoRef = useRef(null);
  const [jumpToPage, setJumpToPage] = useState<string>("");
  const [highlights, setHighlights] = useState<{
    [key: number]: { content: string; text: string }[];
  }>({});
  const [annotations, setAnnotations] = useState<{
    [key: number]: Annotation[];
  }>({});
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [highlightedText, setHighlightedText] = useState("");
  const [annotationFront, setAnnotationFront] = useState("");
  const [annotationBack, setAnnotationBack] = useState("");
  const [annotationPosition, setAnnotationPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [highlightPage, setHighlightPage] = useState<number | null>(null);
  const [annotationBoxPosition, setAnnotationBoxPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<{
    page: number;
    index: number;
  } | null>(null);
  const [highlightStart, setHighlightStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hoveredHighlight, setHoveredHighlight] = useState<{
    page: number;
    index: number;
  } | null>(null);
  const [openAnnotation, setOpenAnnotation] = useState<{
    page: number;
    index: number;
  } | null>(null);
  const [highlightRects, setHighlightRects] = useState<
    { x: number; y: number; width: number; height: number }[]
  >([]);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [allFlashcards, setAllFlashcards] = useState<
    { front: string; back: string }[]
  >([]);
  const [previewLatex, setPreviewLatex] = useState(false);

  const onResize = useCallback<ResizeObserverCallback>((entries) => {
    const [entry] = entries;
    if (entry) {
      setContainerWidth(entry.contentRect.width);
      setContainerHeight(entry.contentRect.height);
    }
  }, []);

  useResizeObserver(containerRef, resizeObserverOptions, onResize);

  function onDocumentLoadSuccess(pdf: PDFDocumentProxy): void {
    setNumPages(pdf.numPages);
    documentRef.current = pdf;
  }

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    // Clear existing annotations
    setAnnotations({});
    // Load saved annotations for this file
    const savedAnnotations = localStorage.getItem(
      `pdf_annotations_${selectedFile.name}`
    );
    if (savedAnnotations) {
      const parsedAnnotations = JSON.parse(savedAnnotations);
      setAnnotations(parsedAnnotations);

      // Load flashcards into spaced repetition manager
      Object.values(parsedAnnotations)
        .flat()
        .forEach((annotation: Annotation) => {
          setAllFlashcards((prevFlashcards) => [
            ...prevFlashcards,
            {
              id: annotation.id,
              front: annotation.front,
              back: annotation.back,
              state: annotation.state,
              interval: annotation.interval,
              easeFactor: annotation.easeFactor,
              dueDate: new Date(annotation.dueDate),
              lastReviewed: annotation.lastReviewed
                ? new Date(annotation.lastReviewed)
                : null,
            },
          ]);
        });
    }
  };

  const zoomOut = () => {
    setScale((prevScale) => {
      const newScale = prevScale / 1.1;
      setPdfWidth(containerWidth ? containerWidth / newScale : 0);
      return newScale;
    });
  };

  const zoomIn = () => {
    setScale((prevScale) => {
      const newScale = prevScale * 1.1;
      setPdfWidth(containerWidth ? containerWidth / newScale : 0);
      return newScale;
    });
  };

  const fitToScreen = async () => {
    if (!documentRef.current || !containerWidth || !containerHeight) return;

    const page = await documentRef.current.getPage(1);
    const viewport = page.getViewport({ scale: 1 });

    // Calculate scale based on height
    const scaleHeight = containerHeight / viewport.height;

    // Check if width fits at this scale, if not, adjust scale based on width
    const scaledWidth = viewport.width * scaleHeight;
    const newScale =
      scaledWidth > containerWidth
        ? containerWidth / viewport.width
        : scaleHeight;

    // Apply new scale
    setScale(newScale);
    setPdfWidth(viewport.width * newScale);
    setPageSize({
      width: viewport.width * newScale,
      height: viewport.height * newScale,
    });
  };

  const onItemClick = ({ pageNumber }: { pageNumber: string | number }) => {
    const targetPage =
      typeof pageNumber === "string" ? parseInt(pageNumber, 10) : pageNumber;
    setCurrentPage(targetPage);
    virtuosoRef.current?.scrollToIndex({
      index: targetPage - 1,
      align: "start",
      behavior: "auto",
    });
  };

  const handleJumpToPage = () => {
    const pageNumber = parseInt(jumpToPage, 10);
    if (pageNumber && pageNumber > 0 && pageNumber <= numPages) {
      setCurrentPage(pageNumber);
      virtuosoRef.current?.scrollToIndex({
        index: pageNumber - 1,
        align: "start",
        behavior: "auto",
      });
    }
    setJumpToPage(""); // Clear the input after jumping
  };

  const toggleHighlighting = () => {
    setIsHighlighting(!isHighlighting);
  };

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (!isHighlighting) return;

    const pageElement = event.currentTarget as HTMLElement;
    const pageRect = pageElement.getBoundingClientRect();

    setHighlightStart({
      x: (event.clientX - pageRect.left) / pageRect.width,
      y: (event.clientY - pageRect.top) / pageRect.height,
    });
  };

  const handleMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (!isHighlighting || !highlightStart) return;

    const pageElement = event.currentTarget as HTMLElement;
    const pageRect = pageElement.getBoundingClientRect();

    const selection = window.getSelection();
    if (selection && selection.toString().trim() !== "") {
      setHighlightedText(selection.toString());

      const range = selection.getRangeAt(0);
      const rects = Array.from(range.getClientRects());

      if (rects.length > 0) {
        // Group rects by their vertical position (assuming a small threshold)
        const threshold = 2; // pixels
        const lineGroups = rects.reduce((acc, rect) => {
          const group = acc.find(
            (g) => Math.abs(g[0].top - rect.top) < threshold
          );
          if (group) {
            group.push(rect);
          } else {
            acc.push([rect]);
          }
          return acc;
        }, [] as DOMRect[][]);

        // Calculate optimal rectangles for each line
        const optimalRects = lineGroups.map((group) => {
          const minX = Math.min(...group.map((r) => r.left));
          const maxX = Math.max(...group.map((r) => r.right));
          const minY = Math.min(...group.map((r) => r.top));
          const maxY = Math.max(...group.map((r) => r.bottom));
          return {
            x: (minX - pageRect.left) / pageRect.width,
            y: (minY - pageRect.top) / pageRect.height,
            width: (maxX - minX) / pageRect.width,
            height: (maxY - minY) / pageRect.height,
          };
        });

        // Set the annotation position to cover all lines
        const annotationPosition = {
          x: Math.min(...optimalRects.map((r) => r.x)),
          y: Math.min(...optimalRects.map((r) => r.y)),
          width:
            Math.max(...optimalRects.map((r) => r.x + r.width)) -
            Math.min(...optimalRects.map((r) => r.x)),
          height:
            Math.max(...optimalRects.map((r) => r.y + r.height)) -
            Math.min(...optimalRects.map((r) => r.y)),
        };

        setAnnotationPosition(annotationPosition);

        // Store the individual line rectangles for rendering
        setHighlightRects(optimalRects);

        // Set the position for the annotation input box
        const lastRect = rects[rects.length - 1];
        setAnnotationBoxPosition({
          top: lastRect.bottom - pageRect.top + 10, // 10px below the last line of the highlight
          left: event.clientX - pageRect.left,
        });

        // Find the closest Page component
        let element = event.target as HTMLElement;
        while (element && !element.dataset.pageNumber) {
          element = element.parentElement as HTMLElement;
        }
        if (element && element.dataset.pageNumber) {
          setHighlightPage(parseInt(element.dataset.pageNumber, 10));
        }
      }
    }

    setHighlightStart(null);
  };

  const addAnnotation = async () => {
    if (
      highlightedText &&
      annotationFront &&
      annotationBack &&
      highlightPage &&
      annotationPosition
    ) {
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        front: annotationFront,
        back: annotationBack,
        position: window.scrollY,
        yPosition: annotationPosition.y,
        text: highlightedText,
        x: annotationPosition.x,
        width: annotationPosition.width,
        height: annotationPosition.height,
        rects: highlightRects,
        state: "new",
        interval: 0,
        easeFactor: 2.5,
        dueDate: new Date(),
        lastReviewed: null,
      };

      setAnnotations((prevAnnotations) => {
        const pageAnnotations = prevAnnotations[highlightPage] || [];
        const isDuplicate = pageAnnotations.some(
          (ann) =>
            ann.x === newAnnotation.x &&
            ann.yPosition === newAnnotation.yPosition &&
            ann.width === newAnnotation.width &&
            ann.height === newAnnotation.height
        );

        if (isDuplicate) {
          return prevAnnotations; // Don't add if it's a duplicate
        }

        const updatedAnnotations = {
          ...prevAnnotations,
          [highlightPage]: [...pageAnnotations, newAnnotation],
        };

        // Save the updated annotations
        saveAnnotations(updatedAnnotations);

        // Add the flashcard to the spaced repetition manager
        setAllFlashcards((prevFlashcards) => [
          ...prevFlashcards,
          {
            id: newAnnotation.id,
            front: newAnnotation.front,
            back: newAnnotation.back,
            state: newAnnotation.state,
            interval: newAnnotation.interval,
            easeFactor: newAnnotation.easeFactor,
            dueDate: newAnnotation.dueDate,
            lastReviewed: newAnnotation.lastReviewed,
          },
        ]);

        return updatedAnnotations;
      });

      setHighlightedText("");
      setAnnotationFront("");
      setAnnotationBack("");
      setAnnotationPosition(null);
      setHighlightPage(null);
      setAnnotationBoxPosition(null);
      setHighlightRects([]);
    }
  };

  const cancelAnnotation = () => {
    setHighlightedText("");
    setAnnotationFront("");
    setAnnotationBack("");
    setAnnotationPosition(null);
    setHighlightPage(null);
    setAnnotationBoxPosition(null);
    setHighlightRects([]);
  };

  const deleteAnnotation = (pageNumber: number, index: number) => {
    setAnnotations((prevAnnotations) => {
      const updatedAnnotations = {
        ...prevAnnotations,
        [pageNumber]: prevAnnotations[pageNumber].filter((_, i) => i !== index),
      };

      // Save the updated annotations
      saveAnnotations(updatedAnnotations);

      return updatedAnnotations;
    });
  };

  const scrollToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    virtuosoRef.current?.scrollToIndex({
      index: pageNumber - 1,
      align: "start",
      behavior: "auto",
    });
  };

  useEffect(() => {
    if (containerWidth) {
      const maxWidth = containerWidth * 0.9;
      setPdfWidth(Math.min(maxWidth, containerWidth / scale));
    }
  }, [containerWidth, scale]);

  const handleHighlightClick = (pageNumber: number, index: number) => {
    setOpenAnnotation({ page: pageNumber, index });
  };

  const closeAnnotation = () => {
    setOpenAnnotation(null);
  };

  const renderHighlights = (pageNumber: number) => {
    return annotations[pageNumber]?.map((annotation, index) =>
      annotation.rects.map((rect, rectIndex) => (
        <div
          key={`highlight-${pageNumber}-${index}-${rectIndex}`}
          style={{
            position: "absolute",
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
            backgroundColor:
              (hoveredAnnotation?.page === pageNumber &&
                hoveredAnnotation?.index === index) ||
              (hoveredHighlight?.page === pageNumber &&
                hoveredHighlight?.index === index)
                ? "rgba(255, 0, 0, 0.2)" // Red highlight when hovered
                : "rgba(255, 255, 0, 0.2)", // Yellow highlight by default
            pointerEvents: "auto",
            cursor: "pointer",
            zIndex: 10,
            transform: `scale(${1 / scale})`,
            transformOrigin: "top left",
          }}
          onMouseEnter={() => setHoveredHighlight({ page: pageNumber, index })}
          onMouseLeave={() => setHoveredHighlight(null)}
          onClick={() => handleHighlightClick(pageNumber, index)}
        />
      ))
    );
  };

  const collectAllFlashcards = () => {
    const allCards = Object.values(annotations).flatMap((pageAnnotations) =>
      pageAnnotations.map((annotation) => ({
        id: annotation.id,
        front: annotation.front,
        back: annotation.back,
        state: annotation.state,
        interval: annotation.interval,
        easeFactor: annotation.easeFactor,
        dueDate: new Date(annotation.dueDate),
        lastReviewed: annotation.lastReviewed
          ? new Date(annotation.lastReviewed)
          : null,
      }))
    );
    setAllFlashcards(allCards);
    setShowFlashcards(true);
  };

  const renderLatex = (text: string) => {
    return text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/).map((part, index) => {
      if (part.startsWith("$$") && part.endsWith("$$")) {
        return <BlockMath key={index}>{part.slice(2, -2)}</BlockMath>;
      } else if (part.startsWith("$") && part.endsWith("$")) {
        return <InlineMath key={index}>{part.slice(1, -1)}</InlineMath>;
      }
      return part;
    });
  };

  const saveAnnotations = (annotations: { [key: number]: Annotation[] }) => {
    localStorage.setItem(
      `pdf_annotations_${file?.name}`,
      JSON.stringify(annotations)
    );
  };

  if (!file) {
    return <FileSelector onFileSelect={handleFileSelect} />;
  }

  if (showFlashcards) {
    return (
      <FlashcardCarousel
        flashcards={allFlashcards}
        onBack={() => setShowFlashcards(false)}
        onUpdate={(updatedFlashcards) => {
          setAllFlashcards(updatedFlashcards);
          setAnnotations((prevAnnotations) => {
            const updatedAnnotations = { ...prevAnnotations };
            for (const pageNumber in updatedAnnotations) {
              updatedAnnotations[pageNumber] = updatedAnnotations[
                pageNumber
              ].map((ann) => {
                const updatedFlashcard = updatedFlashcards.find(
                  (fc) => fc.id === ann.id
                );
                return updatedFlashcard ? { ...ann, ...updatedFlashcard } : ann;
              });
            }
            saveAnnotations(updatedAnnotations);
            return updatedAnnotations;
          });
        }}
      />
    );
  }

  return (
    <div className="bg-white font-sans min-h-screen flex flex-col">
      <header className="bg-[#323639] shadow-md p-5 text-white">
        <h1 className="text-inherit m-0">PDF Spaced Repetition</h1>
        <div className="mb-4 flex gap-2 items-center">
          <button
            onClick={zoomOut}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Zoom Out
          </button>
          <button
            onClick={zoomIn}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Zoom In
          </button>
          <button
            onClick={fitToScreen}
            className="bg-green-500 text-white px-4 py-2 rounded"
          >
            Fit to Screen
          </button>
          <span className="text-white px-4 py-2">
            {scale === 1
              ? Math.round(scale * 100)
              : 100 + Math.round(100 - scale * 100)}%
          </span>
          <div className="flex items-center ml-4">
            <input
              type="number"
              value={jumpToPage}
              onChange={(e) => setJumpToPage(e.target.value)}
              placeholder="Page #"
              className="w-20 px-2 py-1 text-black rounded-l"
              min="1"
              max={numPages}
            />
            <button
              onClick={handleJumpToPage}
              className="bg-yellow-500 text-white px-4 py-1 rounded-r"
            >
              Jump
            </button>
          </div>
          <span className="ml-4">
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={toggleHighlighting}
            className={`px-4 py-2 rounded ${
              isHighlighting ? "bg-yellow-500" : "bg-gray-500"
            } text-white`}
          >
            {isHighlighting ? "Disable Highlighting" : "Enable Highlighting"}
          </button>
          <button
            onClick={collectAllFlashcards}
            className="bg-purple-500 text-white px-4 py-2 rounded"
          >
            View All Flashcards
          </button>
        </div>
      </header>
      <div className="flex flex-grow overflow-hidden">
        <div className="w-64 bg-gray-100 overflow-y-auto p-4 border-r border-gray-300">
          {Object.entries(annotations).map(([pageNumber, pageAnnotations]) => (
            <div key={pageNumber}>
              <h3 className="text-lg font-semibold mb-2">Page {pageNumber}</h3>
              {pageAnnotations.map((annotation, index) => (
                <div
                  key={index}
                  className={`mb-4 p-2 rounded-md shadow cursor-pointer ${
                    (hoveredAnnotation?.page === Number(pageNumber) &&
                      hoveredAnnotation?.index === index) ||
                    (hoveredHighlight?.page === Number(pageNumber) &&
                      hoveredHighlight?.index === index)
                      ? "bg-red-200 hover:bg-red-300"
                      : "bg-yellow-100 hover:bg-yellow-200"
                  }`}
                  onClick={() => scrollToPage(Number(pageNumber))}
                  onMouseEnter={() =>
                    setHoveredAnnotation({ page: Number(pageNumber), index })
                  }
                  onMouseLeave={() => setHoveredAnnotation(null)}
                >
                  <p className="text-sm font-semibold">
                    Front: {renderLatex(annotation.front)}
                  </p>
                  <p className="text-sm mt-1">
                    Back: {renderLatex(annotation.back)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    "{annotation.text}"
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAnnotation(Number(pageNumber), index);
                    }}
                    className="mt-2 text-xs text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex-grow overflow-auto relative" ref={setContainerRef}>
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            options={options}
            className="flex flex-col items-center"
            onItemClick={onItemClick}
          >
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: containerHeight, width: "100%" }}
              totalCount={numPages}
              initialTopMostItemIndex={currentPage - 1}
              scrollToIndex={currentPage - 1}
              itemContent={(index) => (
                <div
                  className="flex justify-center relative"
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                >
                  <Page
                    key={`page_${index + 1}`}
                    pageNumber={index + 1}
                    width={pdfWidth}
                    className="my-4 shadow-md"
                    loading={
                      <div className="text-white">
                        Loading page {index + 1}...
                      </div>
                    }
                    data-page-number={index + 1}
                  />
                  {renderHighlights(index + 1)}
                </div>
              )}
              overscan={2}
            />
          </Document>
          {openAnnotation &&
            createPortal(
              <div
                className="fixed bg-white p-4 shadow-md rounded-md"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1000,
                }}
              >
                <h1 className="text-2xl font-bold mb-2">
                  {renderLatex(
                    annotations[openAnnotation.page][openAnnotation.index].front
                  )}
                </h1>
                <p>
                  {renderLatex(
                    annotations[openAnnotation.page][openAnnotation.index].back
                  )}
                </p>
                <button
                  onClick={closeAnnotation}
                  className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
                >
                  Close
                </button>
              </div>,
              document.body
            )}
          {highlightedText &&
            annotationBoxPosition &&
            createPortal(
              <div
                className="fixed bg-white p-4 shadow-md rounded-md"
                style={{
                  top: `${annotationBoxPosition.top}px`,
                  left: `${annotationBoxPosition.left}px`,
                  zIndex: 1000,
                }}
              >
                <textarea
                  value={annotationFront}
                  onChange={(e) => setAnnotationFront(e.target.value)}
                  placeholder="Front of flashcard... (Use $ for inline LaTeX and $$ for block LaTeX)"
                  className="w-full p-2 border border-gray-300 rounded mb-2"
                />
                {previewLatex && (
                  <div className="mb-2 p-2 border border-gray-300 rounded">
                    {renderLatex(annotationFront)}
                  </div>
                )}
                <textarea
                  value={annotationBack}
                  onChange={(e) => setAnnotationBack(e.target.value)}
                  placeholder="Back of flashcard... (Use $ for inline LaTeX and $$ for block LaTeX)"
                  className="w-full p-2 border border-gray-300 rounded"
                />
                {previewLatex && (
                  <div className="mb-2 p-2 border border-gray-300 rounded">
                    {renderLatex(annotationBack)}
                  </div>
                )}
                <div className="flex justify-between mt-2">
                  <button
                    onClick={addAnnotation}
                    className="bg-blue-500 text-white px-4 py-2 rounded"
                  >
                    Add Flashcard
                  </button>
                  <button
                    onClick={cancelAnnotation}
                    className="bg-gray-500 text-white px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setPreviewLatex(!previewLatex)}
                    className="bg-green-500 text-white px-4 py-2 rounded"
                  >
                    {previewLatex ? "Hide LaTeX" : "Preview LaTeX"}
                  </button>
                </div>
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  );
}
