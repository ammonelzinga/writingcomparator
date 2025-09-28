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
    