1. what document was translated by joseph smith

SELECT d.* 
FROM document d 
WHERE d.author ILIKE '%joseph smith%' AND d.language ILIKE '%translated%'
Results (0)
[]
Summary
It looks like there's no specific information provided in your message. If you could share the results or details you'd like summarized, I'd be happy to help create a friendly summary for you!

2. what documents were written before The Book of Moses (used prompt 1)

SELECT document_id, title, author, tradition, rhetoric_type, language, estimated_date, notes 
FROM document 
WHERE estimated_date < (SELECT estimated_date FROM document WHERE title = 'The Book of Moses')
ORDER BY estimated_date

results []

It looks like there aren't any results to summarize! If you have some information or data you'd like me to help with, please feel free to share, and I'll be happy to assist you!


2. what passages talk about turning the heart of the children to the fathers
    SELECT p.passage_id, p.content
FROM passage p
JOIN passage_theme pt ON p.passage_id = pt.passage_id
JOIN theme t ON pt.theme_id = t.theme_id
WHERE t.name ILIKE '%turning the heart of the children to the fathers%'
Results (0)
[]
Summary
It seems that there's no specific content provided in your message for me to summarize. If you could share the details or information you'd like me to summarize, I’d be more than happy to help!

3. what does doctrine and covenants 138 talk about
    SET ivfflat.probes = 10;

SELECT p.passage_id, p.document_id, p.label, p.content
FROM passage p
JOIN embedding_passage ep ON p.passage_id = ep.passage_id
JOIN theme t ON t.name ILIKE '%doctrine%' OR t.name ILIKE '%covenants%'
JOIN passage_theme pt ON p.passage_id = pt.passage_id AND pt.theme_id = t.theme_id
ORDER BY pt.score DESC
LIMIT 10
    [
  {
    "label": "P57",
    "content": "D&C 129:7 Ask him to shake hands with you, but he will not move, because it is contrary to the order of heaven for a just man to deceive; but he will still deliver his message.",
    "passage_id": 1931,
    "document_id": 8
  },
  {
    "label": "P58",
    "content": "D&C 129:8 If it be the devil as an angel of light, when you ask him to shake hands he will offer you his hand, and you will not feel anything; you may therefore detect him.",
    "passage_id": 1932,
    "document_id": 8
  },
  {
    "label": "P59",
    "content": "D&C 129:9 These are three grand keys whereby you may know whether any administration is from God.",
    "passage_id": 1933,
    "document_id": 8
  },

    ]
    ure! Here's a friendly summary of the results: --- Hey there! 🌟 Here are some interesting insights from the scriptures: 1. **Recognizing True vs. False Messengers**: If you meet a genuine messenger from God and ask to shake hands, they won’t move because they can’t deceive. In contrast, an angel of light might offer a handshake but you won't feel anything. This is a great way to tell the difference! (D&C 129) 2. **Key Insights from Joseph Smith**: In a teaching from April 1843, Joseph Smith shared some important truths. He explained that when the Savior returns, He'll appear as a man, and that the social connections we have in this life will continue in a glorious form in the next. He also emphasized that blessings come from following divine laws. (D&C 130) 3. **The Nature of God**: It's revealed that both God the Father and Jesus Christ have bodies of flesh and bones, while the Holy Ghost is a spirit. This is a fundamental understanding that helps clarify their unique natures. (D&C 130) Overall, these teachings emphasize the importance of discernment in spiritual matters, the nature of divine beings, and the joy of eternal connections. Hope you find this as uplifting and thought-provoking as I do! 😊


4. what documents were written before The Book of Moses (used prompt 2)
    SET ivfflat.probes = 10;

SET ivfflat.probes = 10;

SELECT d.document_id, d.title, d.author, d.tradition, d.rhetoric_type, d.language, d.estimated_date, d.notes
FROM document d
WHERE d.estimated_date < (SELECT estimated_date FROM document WHERE title = 'The Book of Moses')
ORDER BY d.estimated_date DESC
LIMIT 10

It seems like you didn't provide any specific results or information to summarize. Could you please share the details or data you'd like me to summarize? I'd be happy to help!

5. what documents were written before the book of Moses (used prompt 3)

    WITH parsed_dates AS (
    SELECT document_id, title, author, estimated_date,
           CASE 
               WHEN estimated_date ~ '^\d{4} AD$' THEN to_date(estimated_date, 'YYYY AD')
               WHEN estimated_date ~ '^\d{4} BC$' THEN to_date(estimated_date, 'YYYY BC')
               WHEN estimated_date ~ '^\d{1,3} (Century)$' THEN to_date(to_char(EXTRACT(YEAR FROM NOW()), '9999') || COALESCE(substring(estimated_date, '([0-9]+)'), '0'), '9999') - ((substring(estimated_date, '([0-9]+)')::int - 1) * 100)
               ELSE NULL
           END AS parsed_date
    FROM document
)
SELECT document_id, title, author, estimated_date
FROM parsed_dates
WHERE parsed_date < (SELECT parsed_date 
                      FROM parsed_dates 
                      WHERE title = 'The Book of Moses')
ORDER BY parsed_date
LIMIT 10

output []

nothing to show




6. I am a Christian what should I study? (used prompt 3)

SET ivfflat.probes = 10;

SELECT p.passage_id, p.label, p.content
FROM passage p
JOIN embedding_passage ep ON p.passage_id = ep.passage_id
WHERE ep.embedding_vector <-> (SELECT query_vector FROM userquery WHERE query_text = 'I am a Christian. What should I study') < 0.5
ORDER BY ep.embedding_vector <-> (SELECT query_vector FROM userquery WHERE query_text = 'I am a Christian. What should I study') 
LIMIT 10

output []

nothing

7. I am a Christian what documents should I study (prompt 4)

SET ivfflat.probes = 10;

SELECT p.label, p.content, d.title, d.author, d.estimated_date
FROM passage p
JOIN document d ON p.document_id = d.document_id
JOIN embedding_passage ep ON p.passage_id = ep.passage_id
JOIN theme t ON EXISTS (
    SELECT 1
    FROM passage_theme pt
    WHERE pt.passage_id = p.passage_id AND pt.theme_id = t.theme_id
)
WHERE t.name ILIKE '%christian%'
ORDER BY ep.embedding_vector <=> (SELECT embedding_vector FROM theme WHERE name = 'Christian')
LIMIT 10

Results: [
  {
    "label": "P53",
    "title": "Doctrine and Covenants 120-end",
    "author": "Joseph Smith Jr",
    "content": "D&C 129:3 Secondly: the spirits of just men made perfect, they who are not resurrected, but inherit the same glory.",
    "estimated_date": "1835"
  },
  {
    "label": "P235",
    "title": "Doctrine and Covenants 120-end",
    "author": "Joseph Smith Jr",
    "content": "D&C 134:0 A Declaration of Belief regarding Governments and Laws in general, adopted by unanimous vote at a general assembly of the Church of Jesus Christ of Latter-day Saints, held at Kirtland, Ohio, August 17, 1835, with the following preamble: That our belief with regard to earthly governments and laws in general may not be misinterpreted nor misunderstood, we have thought proper to present at the close of this volume our opinion concerning the same. --This was inserted near the end of the Book of Commandments, as compiled at that time. See History of the Church, vol. 2, p. 247.",
    "estimated_date": "1835"
  },]

  (continues on with just doctrine and Covenants)

  Summary: Here's a friendly summary of the results you've shared: 1. **Doctrine and Covenants 129:3** - Joseph Smith Jr. discusses the spirits of just individuals who have not yet been resurrected but still enjoy the same glory. This was penned in 1835. 2. **Doctrine and Covenants 134:0** - In a declaration made during a church assembly in Kirtland, Ohio, on August 17, 1835, the church leaders expressed their beliefs regarding government and laws, emphasizing the importance of understanding their (continues on)

  8.  Same question as above (prompt 5)
  
  SET ivfflat.probes = 10;

SELECT p.passage_id, p.label, p.content, d.title, d.author
FROM passage p
JOIN document d ON p.document_id = d.document_id
JOIN embedding_passage ep ON p.passage_id = ep.passage_id
JOIN theme t ON EXISTS (SELECT 1 FROM passage_theme pt WHERE pt.passage_id = p.passage_id AND pt.theme_id = t.theme_id)
WHERE t.name = 'Christian'
ORDER BY ep.embedding_vector <=> (SELECT embedding_vector FROM theme WHERE name = 'Christian') 
LIMIT 10

As a Christian, there are several key documents and texts you might consider studying to deepen your faith and understanding. Here are some recommendations: 1. **The Bible**: This is the foundational text for Christianity. You might want to explore different translations and versions, such as the NIV, ESV, or NASB, along with studying specific books or passages. 2. **Catechisms**: Depending on your denomination, catechisms like the Westminster Shorter Catechism or the Heidelberg Catechism can provide structured theological teachings. 3. **Confessions of Faith**: Many Protestant denominations have confessions (e.g., the Nicene Creed, the Apostles' Creed, the Westminster Confession) that articulate essential beliefs. 4. **Theologians' Works**: Read influential Christian theologians like Augustine, Martin Luther, John Calvin, C.S. Lewis, or more contemporary authors like N.T. Wright and Tim Keller. 5.

9. same, tried again tho: 

SET ivfflat.probes = 10;

SELECT p.passage_id, p.label, p.content, d.title, d.author, d.estimated_date
FROM passage p
JOIN embedding_passage ep ON p.passage_id = ep.passage_id
JOIN document d ON p.document_id = d.document_id
JOIN theme t ON EXISTS (
    SELECT 1
    FROM passage_theme pt
    WHERE pt.passage_id = p.passage_id AND pt.theme_id = t.theme_id
)
WHERE t.name ILIKE '%christian%'
ORDER BY ep.embedding_vector <=> (SELECT embedding_vector FROM theme WHERE name = 'Christian Studies') 
LIMIT 10

[
  {
    "label": "P53",
    "title": "Doctrine and Covenants 120-end",
    "author": "Joseph Smith Jr",
    "content": "D&C 129:3 Secondly: the spirits of just men made perfect, they who are not resurrected, but inherit the same glory.",
    "passage_id": 1927,
    "estimated_date": "1835"
  },]

  As a Christian, particularly if you identify with the Latter-day Saint tradition, here are some important documents you may consider studying based on the results provided: 1. **Doctrine and Covenants (D&C)**: This is a collection of revelations and writings primarily by Joseph Smith Jr. It contains various sections important for understanding the beliefs and governance of the Church. - **D&C 129:3**: Discusses the spirits of just men made perfect. - **D&C 134:0**: A declaration regarding beliefs about governments and laws. - **D&C




  10. with limit set to at least 100, it ouputted the same 100 documents of D&C

  
