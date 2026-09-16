// "Transport & Opportunity Digital Access" with T, O, D and A picked out, so
// the words visibly spell TODA.
const WORDS = ['Transport', '&', 'Opportunity', 'Digital', 'Access']

export function TodaAcronym({ letterClassName }: { letterClassName: string }) {
  return (
    <>
      {WORDS.map((word, i) => (
        <span key={word}>
          {i > 0 && ' '}
          {word === '&' ? (
            word
          ) : (
            <>
              <span className={letterClassName}>{word[0]}</span>
              {word.slice(1)}
            </>
          )}
        </span>
      ))}
    </>
  )
}
