-- Seed quotes with themes relevant to common LLM conversation topics
-- Themes: programming, debugging, learning, creativity, persistence, simplicity, complexity, patience, growth, decision-making, uncertainty, writing, problem-solving, motivation, failure, success

INSERT INTO quotes (text, author, themes) VALUES

-- Programming & Debugging
('Simplicity is prerequisite for reliability.', 'Edsger Dijkstra', '["simplicity", "programming", "reliability", "debugging"]'),
('The most effective debugging tool is still careful thought, coupled with judiciously placed print statements.', 'Brian Kernighan', '["debugging", "programming", "problem-solving", "thinking"]'),
('First, solve the problem. Then, write the code.', 'John Johnson', '["programming", "problem-solving", "planning", "thinking"]'),
('Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', 'Martin Fowler', '["programming", "clarity", "simplicity", "communication"]'),
('The computer was born to solve problems that did not exist before.', 'Bill Gates', '["programming", "technology", "problem-solving", "irony"]'),
('Talk is cheap. Show me the code.', 'Linus Torvalds', '["programming", "action", "directness", "work"]'),
('Measuring programming progress by lines of code is like measuring aircraft building progress by weight.', 'Bill Gates', '["programming", "metrics", "quality", "thinking"]'),
('The best error message is the one that never shows up.', 'Thomas Fuchs', '["debugging", "programming", "prevention", "design"]'),
('Deleted code is debugged code.', 'Jeff Sickel', '["debugging", "simplicity", "programming", "minimalism"]'),
('It works on my machine.', 'Anonymous Developer', '["debugging", "programming", "frustration", "humor"]'),

-- Learning & Growth
('The only true wisdom is in knowing you know nothing.', 'Socrates', '["learning", "wisdom", "humility", "growth"]'),
('Live as if you were to die tomorrow. Learn as if you were to live forever.', 'Mahatma Gandhi', '["learning", "motivation", "growth", "urgency"]'),
('The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.', 'Brian Herbert', '["learning", "growth", "choice", "motivation"]'),
('I am always doing that which I cannot do, in order that I may learn how to do it.', 'Pablo Picasso', '["learning", "growth", "challenge", "creativity"]'),
('The beautiful thing about learning is that nobody can take it away from you.', 'B.B. King', '["learning", "growth", "value", "permanence"]'),
('In learning you will teach, and in teaching you will learn.', 'Phil Collins', '["learning", "teaching", "growth", "reciprocity"]'),
('The more I learn, the more I realize how much I do not know.', 'Albert Einstein', '["learning", "humility", "wisdom", "growth"]'),
('Education is not the filling of a pail, but the lighting of a fire.', 'William Butler Yeats', '["learning", "education", "motivation", "inspiration"]'),

-- Persistence & Patience
('It does not matter how slowly you go as long as you do not stop.', 'Confucius', '["persistence", "patience", "progress", "motivation"]'),
('Patience is not the ability to wait, but the ability to keep a good attitude while waiting.', 'Joyce Meyer', '["patience", "attitude", "waiting", "mindset"]'),
('The two most powerful warriors are patience and time.', 'Leo Tolstoy', '["patience", "time", "persistence", "strategy"]'),
('Rivers know this: there is no hurry. We shall get there some day.', 'A.A. Milne', '["patience", "persistence", "nature", "calm"]'),
('Perseverance is not a long race; it is many short races one after the other.', 'Walter Elliot', '["persistence", "endurance", "motivation", "progress"]'),
('Success is not final, failure is not fatal: it is the courage to continue that counts.', 'Winston Churchill', '["persistence", "failure", "success", "courage"]'),
('Fall seven times, stand up eight.', 'Japanese Proverb', '["persistence", "failure", "resilience", "motivation"]'),
('The only way to do great work is to love what you do.', 'Steve Jobs', '["motivation", "passion", "work", "success"]'),

-- Problem Solving & Thinking
('We cannot solve our problems with the same thinking we used when we created them.', 'Albert Einstein', '["problem-solving", "thinking", "change", "creativity"]'),
('If I had an hour to solve a problem, I would spend 55 minutes thinking about the problem and 5 minutes thinking about solutions.', 'Albert Einstein', '["problem-solving", "thinking", "planning", "strategy"]'),
('The formulation of a problem is often more essential than its solution.', 'Albert Einstein', '["problem-solving", "thinking", "clarity", "understanding"]'),
('A problem well stated is a problem half solved.', 'Charles Kettering', '["problem-solving", "clarity", "thinking", "communication"]'),
('Every problem is a gift—without problems we would not grow.', 'Anthony Robbins', '["problem-solving", "growth", "perspective", "opportunity"]'),
('The significant problems we face cannot be solved at the same level of thinking we were at when we created them.', 'Albert Einstein', '["problem-solving", "thinking", "growth", "perspective"]'),

-- Creativity & Writing
('Creativity is intelligence having fun.', 'Albert Einstein', '["creativity", "intelligence", "play", "thinking"]'),
('The chief enemy of creativity is good sense.', 'Pablo Picasso', '["creativity", "convention", "risk", "thinking"]'),
('Start writing, no matter what. The water does not flow until the faucet is turned on.', 'Louis L''Amour', '["writing", "creativity", "starting", "action"]'),
('You can always edit a bad page. You cannot edit a blank page.', 'Jodi Picoult', '["writing", "creativity", "starting", "perfectionism"]'),
('The first draft is just you telling yourself the story.', 'Terry Pratchett', '["writing", "creativity", "process", "drafting"]'),
('Easy reading is damn hard writing.', 'Nathaniel Hawthorne', '["writing", "effort", "simplicity", "craft"]'),
('There is nothing to writing. All you do is sit down at a typewriter and bleed.', 'Ernest Hemingway', '["writing", "creativity", "honesty", "effort"]'),
('Write drunk, edit sober.', 'Ernest Hemingway', '["writing", "creativity", "editing", "process"]'),

-- Decision Making & Uncertainty
('In any moment of decision, the best thing you can do is the right thing, the next best thing is the wrong thing, and the worst thing you can do is nothing.', 'Theodore Roosevelt', '["decision-making", "action", "uncertainty", "courage"]'),
('The risk of a wrong decision is preferable to the terror of indecision.', 'Maimonides', '["decision-making", "uncertainty", "action", "fear"]'),
('When you have to make a choice and do not make it, that is in itself a choice.', 'William James', '["decision-making", "choice", "action", "passivity"]'),
('Life is the sum of all your choices.', 'Albert Camus', '["decision-making", "choice", "life", "responsibility"]'),
('The only way to make sense out of change is to plunge into it, move with it, and join the dance.', 'Alan Watts', '["uncertainty", "change", "acceptance", "flow"]'),
('Uncertainty is the only certainty there is, and knowing how to live with insecurity is the only security.', 'John Allen Paulos', '["uncertainty", "security", "acceptance", "wisdom"]'),

-- Simplicity & Complexity
('Simplicity is the ultimate sophistication.', 'Leonardo da Vinci', '["simplicity", "sophistication", "design", "elegance"]'),
('Everything should be made as simple as possible, but not simpler.', 'Albert Einstein', '["simplicity", "complexity", "balance", "design"]'),
('Complexity is the enemy of execution.', 'Tony Robbins', '["simplicity", "complexity", "execution", "focus"]'),
('Nature is pleased with simplicity.', 'Isaac Newton', '["simplicity", "nature", "elegance", "truth"]'),
('Out of clutter, find simplicity. From discord, find harmony. In the middle of difficulty lies opportunity.', 'Albert Einstein', '["simplicity", "harmony", "opportunity", "difficulty"]'),
('The ability to simplify means to eliminate the unnecessary so that the necessary may speak.', 'Hans Hofmann', '["simplicity", "clarity", "focus", "design"]'),

-- Failure & Success
('I have not failed. I have just found 10,000 ways that will not work.', 'Thomas Edison', '["failure", "persistence", "learning", "perspective"]'),
('Failure is simply the opportunity to begin again, this time more intelligently.', 'Henry Ford', '["failure", "learning", "opportunity", "growth"]'),
('It is hard to fail, but it is worse never to have tried to succeed.', 'Theodore Roosevelt', '["failure", "trying", "courage", "regret"]'),
('Only those who dare to fail greatly can ever achieve greatly.', 'Robert F. Kennedy', '["failure", "risk", "achievement", "courage"]'),
('Success is stumbling from failure to failure with no loss of enthusiasm.', 'Winston Churchill', '["failure", "success", "persistence", "enthusiasm"]'),
('The greatest glory in living lies not in never falling, but in rising every time we fall.', 'Nelson Mandela', '["failure", "resilience", "persistence", "glory"]'),

-- Time & Productivity
('Time is what we want most, but what we use worst.', 'William Penn', '["time", "productivity", "waste", "priorities"]'),
('The bad news is time flies. The good news is you are the pilot.', 'Michael Altshuler', '["time", "control", "agency", "motivation"]'),
('Lost time is never found again.', 'Benjamin Franklin', '["time", "urgency", "productivity", "priorities"]'),
('Do not wait. The time will never be just right.', 'Napoleon Hill', '["time", "action", "procrastination", "starting"]'),
('You may delay, but time will not.', 'Benjamin Franklin', '["time", "procrastination", "urgency", "action"]'),
('Procrastination is the thief of time.', 'Edward Young', '["procrastination", "time", "productivity", "action"]'),

-- Wisdom & Philosophy
('Knowing yourself is the beginning of all wisdom.', 'Aristotle', '["wisdom", "self-knowledge", "growth", "philosophy"]'),
('The unexamined life is not worth living.', 'Socrates', '["wisdom", "self-reflection", "philosophy", "meaning"]'),
('He who has a why to live can bear almost any how.', 'Friedrich Nietzsche', '["meaning", "purpose", "resilience", "philosophy"]'),
('To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.', 'Ralph Waldo Emerson', '["authenticity", "self", "society", "courage"]'),
('The mind is everything. What you think you become.', 'Buddha', '["mindset", "thinking", "growth", "philosophy"]'),
('We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Aristotle', '["habit", "excellence", "consistency", "growth"]'),

-- Courage & Fear
('Courage is not the absence of fear, but rather the judgment that something else is more important than fear.', 'Ambrose Redmoon', '["courage", "fear", "judgment", "priorities"]'),
('Do the thing you fear and the death of fear is certain.', 'Ralph Waldo Emerson', '["fear", "action", "courage", "growth"]'),
('Feel the fear and do it anyway.', 'Susan Jeffers', '["fear", "action", "courage", "motivation"]'),
('Everything you have ever wanted is on the other side of fear.', 'George Addair', '["fear", "desire", "courage", "growth"]'),
('Fear is the mind-killer.', 'Frank Herbert', '["fear", "mind", "control", "philosophy"]'),

-- Work & Craft
('The only way to do great work is to love what you do.', 'Steve Jobs', '["work", "passion", "motivation", "success"]'),
('Hard work beats talent when talent does not work hard.', 'Tim Notke', '["work", "talent", "effort", "persistence"]'),
('There are no shortcuts to any place worth going.', 'Beverly Sills', '["work", "shortcuts", "effort", "value"]'),
('Quality is not an act, it is a habit.', 'Aristotle', '["quality", "habit", "consistency", "craft"]'),
('The secret of getting ahead is getting started.', 'Mark Twain', '["starting", "action", "progress", "motivation"]'),
('Done is better than perfect.', 'Sheryl Sandberg', '["perfectionism", "completion", "action", "pragmatism"]'),

-- Communication & Clarity
('The single biggest problem in communication is the illusion that it has taken place.', 'George Bernard Shaw', '["communication", "clarity", "misunderstanding", "assumption"]'),
('If you cannot explain it simply, you do not understand it well enough.', 'Albert Einstein', '["communication", "simplicity", "understanding", "clarity"]'),
('The most important thing in communication is hearing what is not said.', 'Peter Drucker', '["communication", "listening", "understanding", "subtext"]'),
('Brevity is the soul of wit.', 'William Shakespeare', '["communication", "brevity", "clarity", "writing"]'),

-- Change & Adaptation
('Change is the only constant in life.', 'Heraclitus', '["change", "life", "philosophy", "adaptation"]'),
('It is not the strongest of the species that survives, nor the most intelligent, but the one most responsive to change.', 'Charles Darwin', '["change", "adaptation", "survival", "evolution"]'),
('Progress is impossible without change, and those who cannot change their minds cannot change anything.', 'George Bernard Shaw', '["change", "progress", "thinking", "growth"]'),
('The secret of change is to focus all of your energy not on fighting the old, but on building the new.', 'Socrates', '["change", "focus", "energy", "building"]'),

-- Frustration & Difficulty (common in debugging/problem-solving contexts)
('The darkest hour has only sixty minutes.', 'Morris Mandel', '["difficulty", "patience", "persistence", "hope"]'),
('Smooth seas do not make skillful sailors.', 'African Proverb', '["difficulty", "growth", "challenge", "skill"]'),
('The gem cannot be polished without friction, nor man perfected without trials.', 'Chinese Proverb', '["difficulty", "growth", "challenge", "perfection"]'),
('What we achieve inwardly will change outer reality.', 'Plutarch', '["mindset", "change", "inner-work", "reality"]'),
('When everything seems to be going against you, remember that the airplane takes off against the wind, not with it.', 'Henry Ford', '["difficulty", "resistance", "perspective", "motivation"]');
