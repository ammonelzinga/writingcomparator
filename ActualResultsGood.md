Good results: 

simple queries that ask for known table attributes: 

1. what are some themes in the book of Moses
    SQL Generated: 
        SELECT DISTINCT t.name
        FROM theme t
        JOIN passage_theme pt ON t.theme_id = pt.theme_id
        JOIN passage p ON pt.passage_id = p.passage_id
        JOIN document d ON p.document_id = d.document_id
        WHERE d.title ILIKE '%Moses%'
    
    Raw results (shortened):
  {"name": "Fall of Man"},{"name": "Eternal Life"},{"name": "Formation of Humankind"},{"name": "Creation ofman"},{ "name": "Impending judgment"},{"name": "spiritual rebirth"},{"name": "The tree of knowledge"},
  { "name": "worship of God"},{"name": "Creation"}, {"name": "repentance"},

    Friendly Answer (shortened):
        Here’s a friendly summary of the results you provided: This collection touches on important themes surrounding creation, human existence, and our relationship with the divine. It delves into the story of humanity, starting from the Creation and the Fall of Man, highlighting key concepts like Original Sin, the presence of evil, and God's commandments. We see discussions on divine blessings and the promise of salvation, emphasizing the journey of repentance, spiritual rebirth, and the importance of righteousness and worship of God. 
 
2. what book was written after 1700
    This one actually took a bit to get right since my date attribute is a string on purpose:

    SELECT title 
    FROM document 
    WHERE ( (NULLIF(regexp_replace(estimated_date, '[^0-9]', '', 'g'), '')::int) > 1700 )

    {"title": "Moses}

    Sure! It looks like there’s a result related to the title "Moses." If you have any specific questions or if there’s something else you’d like to know about it, feel free to ask!

3. give me the first passage from matthew (used prompt 8)

SELECT p.*
FROM passage p
JOIN document d ON p.document_id = d.document_id
WHERE d.title = 'Matthew'
ORDER BY p.passage_id
LIMIT 1

gave a raw file of the below passage that I don't want to repeat

Here is the first passage from the Book of Matthew entirely: **Matthew 1:1-18** 1. The book of the generation of Jesus Christ, the son of David, the son of Abraham. 2. Abraham begat Isaac; and Isaac begat Jacob; and Jacob begat Judas and his brethren; 3. And Judas begat Phares and Zara of Thamar; and Phares begat Esrom; and Esrom begat Aram; 4. And Aram begat Aminadab; and Aminadab begat Naasson; and Naasson begat Salmon; 5. And Salmon begat Booz of Rachab; and Booz begat Obed of Ruth; and Obed begat Jesse; 6. And Jesse begat David the king; and David the king begat Solomon of her that had been the wife of Urias; 7. And Solomon begat Roboam; and Roboam begat Abia; and Abia begat Asa; 8. And Asa begat Josaphat; and Josaphat begat Joram; and Joram begat Ozias; 9. And Ozias begat Joatham; and Joatham begat Achaz; and Achaz begat Ezekias; 10. And Ezekias begat Manasses; and Manasses begat Amon; and Amon begat Josias; 11. And Josias begat Jechonias and his brethren, about the time they were carried away to Babylon: 12. And after they were brought to Babylon, Jechonias begat Salathiel; and Salathiel begat Zorobabel; 13. And Zorobabel begat Abiud; and Abiud begat Eliakim; and Eliakim begat Azor; 14. And Azor begat Sadoc; and Sadoc begat Achim; and Achim begat Eliud; 15. And Eliud begat Eleazar; and Eleazar begat Matthan; and Matthan begat Jacob; 16. And Jacob begat Joseph the husband of Mary, of whom was born Jesus, who is called Christ. 17. So all the generations from Abraham to David are fourteen generations; and from David until the carrying away into Babylon are fourteen generations; and from the carrying away into Babylon unto Christ are fourteen generations. 18. Now the birth of Jesus Christ was on this wise: When as his mother Mary was espoused to Joseph, before they came together, she was found with child of the Holy Ghost.
    
"what passages talk about turning the heart of the children to the fathers"

SELECT p.passage_id, p.content, d.title, d.tradition,
       1 - (ep.embedding_vector <=> :query_embedding) AS similarity
FROM embedding_passage ep
JOIN passage p ON p.passage_id = ep.passage_id
JOIN document d ON d.document_id = p.document_id
ORDER BY ep.embedding_vector <=> :query_embedding
LIMIT 200

Summary
The passages retrieved primarily highlight the spiritual and familial themes of reconciliation, particularly between generations. Most notably, Malachi 4:6 states, "And he shall turn the heart of the fathers to the children, and the heart of the children to their fathers," emphasizing a divine promise of restoration in familial relationships in preparation for significant events. This theme is echoed in the Doctrine and Covenants (D&C), specifically in D&C 138:47, which refers to the Prophet Elijah planting the promises made to the fathers in the hearts of the children, reinforcing the continuity and responsibility between generations. Additionally, D&C 128:18 mentions the necessity of a "welding link" between fathers and children, further connecting these relationships to the redemptive work, particularly in relation to the baptism for the dead, highlighting a broader spiritual continuum that affects both the living and the deceased. Overall, these texts communicate a profound principle concerning the importance of family ties and the divine mandate for reconciliation, suggesting that the harmony of hearts between generations is essential for personal and collective spiritual fulfillment, particularly in anticipation of divine intervention.