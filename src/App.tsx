export default function App() {
  return <div style={{padding: '20px'}}>
    <h1>Hello from The Overseer!</h1>
    <p>App is rendering!</p>
  </div>;
}
  const [screen, setScreen] = useState<GameScreen>('API_SETUP');
  const [apiKey, setApiKey] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayer, setActivePlayer] = useState<'player_1' | 'player_2'>('player_1');
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Turn State
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [p1Draft, setP1Draft] = useState('');
  const[p2Draft, setP2Draft] = useState('');
  const [judgingResult, setJudgingResult] = useState<JudgingResult | null>(null);
  const [hasSeenIntro, setHasSeenIntro] = useState({ player_1: false, player_2: false });
  const[introText, setIntroText] = useState('');

  // Modals & Inputs
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const[catNameInput, setCatNameInput] = useState('');
  const[catDescInput, setCatDescInput] = useState('');

  useEffect(() => {
    const key = localStorage.getItem('GEMINI_KEY');
    if (key) {
      try {
        setApiKey(key);
        initGemini(key);
        setScreen('ONBOARDING');
      } catch (e) {
        console.error("Failed to initialize with saved API key:", e);
        localStorage.removeItem('GEMINI_KEY');
      }
    }
    fetchPrompt('ui_intro_message.md')
      .then(setIntroText)
      .catch(e => {
        console.error("Failed to fetch intro prompt:", e);
        setIntroText('Get ready for the ultimate test of creativity and wit!');
      });
  },[]);

  const saveApiKey = () => {
    localStorage.setItem('GEMINI_KEY', apiKey);
    initGemini(apiKey);
    setScreen('ONBOARDING');
  };

  const handleOnboarding = (name: string, color: string) => {
    const newPlayer: Player = { id: activePlayer, name, color };
    setPlayers(prev =>[...prev, newPlayer]);
    if (activePlayer === 'player_1') {
      setActivePlayer('player_2');
      (document.getElementById('nameInput') as HTMLInputElement).value = '';
    } else {
      setScreen('CATEGORY_CREATION');
      setActivePlayer('player_1');
    }
  };

  const openCategoryModal = (cat?: Category) => {
    if (cat) {
      setEditingCat(cat);
      setCatNameInput(cat.name);
      setCatDescInput(cat.description);
    } else {
      setEditingCat(null);
      setCatNameInput('');
      setCatDescInput('');
    }
    setShowCatModal(true);
  };

  const saveCategory = () => {
    if (!catNameInput || !catDescInput) return;
    
    if (editingCat) {
      setCategories(cats => cats.map(c => c.id === editingCat.id ? { ...c, name: catNameInput, description: catDescInput } : c));
    } else {
      setCategories(cats =>[...cats, {
        id: Math.random().toString(),
        name: catNameInput, 
        description: catDescInput,
        createdBy: activePlayer,
        capturedBy: null,
        history: [],
        isTie: false
      }]);
    }
    setShowCatModal(false);
  };

  const generateAI = async () => {
    try {
      const res = await generateAICategory();
      setCategories(cats =>[...cats, {
        id: Math.random().toString(),
        name: res.category_name,
        description: res.category_description,
        createdBy: 'ai',
        capturedBy: null,
        history: [],
        isTie: false
      }]);
    } catch (e) {
      alert("Failed to generate AI category.");
      console.error(e);
    }
  };

  const startGame = () => {
    setScreen('BATTLE_PATH');
    setActivePlayer('player_1');
  };

  const startTurn = (cat: Category) => {
    if (cat.capturedBy) return;
    setActiveCategory(cat);
    setScreen('HANDOFF');
  };

  const resolveTurn = async () => {
    setScreen('RESOLVING');
    if (!activeCategory) return;
    
    const isTieBreaker = activeCategory.isTie;
    const prevLog = isTieBreaker ? activeCategory.history[activeCategory.history.length - 1] : undefined;

    try {
      const result = await judgeTurn(
        activeCategory.name, 
        activeCategory.description, 
        p1Draft, 
        p2Draft,
        isTieBreaker,
        prevLog?.player1Text,
        prevLog?.player2Text,
        prevLog?.judgingLog
      );

      setJudgingResult(result);
      
      const newHistory =[...activeCategory.history, { player1Text: p1Draft, player2Text: p2Draft, judgingLog: result }];
      
      setCategories(cats => cats.map(c => {
        if (c.id === activeCategory.id) {
          return {
            ...c,
            history: newHistory,
            capturedBy: result.winner_id === 'tie' ? null : result.winner_id,
            isTie: result.winner_id === 'tie'
          };
        }
        return c;
      }));

      setScreen('RESULTS_MODAL');
    } catch (e) {
      alert("Judging Failed. Check console.");
      console.error(e);
      setScreen('BATTLE_PATH');
    }
  };

  const completeTurn = () => {
    setP1Draft('');
    setP2Draft('');
    setActiveCategory(null);
    setJudgingResult(null);

    const p1Score = categories.filter(c => c.capturedBy === 'player_1').length;
    const p2Score = categories.filter(c => c.capturedBy === 'player_2').length;

    if (p1Score >= 3 || p2Score >= 3) {
      setScreen('WIN_SCREEN');
    } else {
      setScreen('BATTLE_PATH');
      setActivePlayer('player_1');
    }
  };

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-duo-gray relative flex flex-col overflow-hidden shadow-2xl md:rounded-3xl md:h-[95vh] md:mt-[2.5vh]">
      {(screen !== 'API_SETUP' && screen !== 'ONBOARDING' && screen !== 'HANDOFF') && (
        <Header players={players} activePlayerId={activePlayer} />
      )}

      <main className="flex-1 overflow-y-auto scrollbar-hide pt-20 pb-6 px-6 z-10 relative">
        <AnimatePresence mode='wait'>
          
          {screen === 'API_SETUP' && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col h-full justify-center text-center gap-6">
              <Settings className="w-16 h-16 mx-auto text-duo-gray-dark" />
              <h1 className="text-3xl font-black text-gray-800">The Overseer</h1>
              <p className="text-gray-500 font-bold">Enter Gemini API Key to awake the Overseer.</p>
              <input 
                type="password"
                className="w-full bg-white border-2 border-gray-200 rounded-2xl p-4 font-bold text-center outline-none focus:border-duo-blue"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
              />
              <Button onClick={saveApiKey} disabled={!apiKey}>Awaken</Button>
            </motion.div>
          )}

          {screen === 'ONBOARDING' && (
            <motion.div key={activePlayer} initial={{x:100, opacity:0}} animate={{x:0, opacity:1}} exit={{x:-100, opacity:0}} className="flex flex-col h-full justify-center text-center gap-6">
              <h2 className="text-2xl font-black text-gray-800 uppercase tracking-widest">Hand phone to</h2>
              <h1 className="text-5xl font-black text-duo-blue">{activePlayer === 'player_1' ? 'Player 1' : 'Player 2'}</h1>
              <input 
                id="nameInput"
                type="text"
                maxLength={12}
                className="w-full bg-white border-2 border-gray-200 rounded-2xl p-4 font-bold text-center outline-none focus:border-duo-blue mt-8 text-2xl"
                placeholder="Enter Name"
              />
              <div className="flex justify-center gap-3 mt-4 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} onClick={() => handleOnboarding((document.getElementById('nameInput') as HTMLInputElement).value || activePlayer, c)} className="w-12 h-12 rounded-full border-4 border-transparent hover:scale-110 transition-all active:scale-95" style={{backgroundColor: c}} />
                ))}
              </div>
            </motion.div>
          )}

          {screen === 'CATEGORY_CREATION' && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col h-full gap-4 relative">
              <h2 className="text-2xl font-black text-center mb-2 text-gray-800">Create Categories</h2>
              <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                {categories.map(c => (
                  <div key={c.id} onClick={() => openCategoryModal(c)} className="bg-white rounded-2xl p-4 border-b-4 border-gray-200 cursor-pointer active:translate-y-1 active:border-b-0 transition-all shadow-sm">
                    <h3 className="font-black text-lg text-gray-800">{c.name}</h3>
                    <p className="text-gray-500 font-semibold text-sm truncate">{c.description.substring(0, 50)}...</p>
                  </div>
                ))}
              </div>
              
              <div className="mt-auto space-y-3 shrink-0">
                <Button variant="ghost" className="flex items-center justify-center gap-2" onClick={() => openCategoryModal()}>
                  <Plus className="w-6 h-6" /> Add Custom
                </Button>
                {categories.filter(c => c.createdBy === 'ai').length === 0 && (
                  <Button variant="secondary" onClick={generateAI}>Generate AI Category</Button>
                )}
                {categories.length >= 5 && (
                  <Button variant="primary" onClick={startGame}>Start Game</Button>
                )}
              </div>
            </motion.div>
          )}

          {screen === 'BATTLE_PATH' && (
             <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col h-full relative py-10">
               <div className="absolute inset-0 flex justify-center pointer-events-none">
                  <svg width="4" height="100%" className="text-gray-300">
                    <line x1="2" y1="0" x2="2" y2="100%" stroke="currentColor" strokeWidth="4" strokeDasharray="10 10"/>
                  </svg>
               </div>
               <div className="flex flex-col justify-between h-full relative z-10">
                 {categories.map((c, i) => {
                    const offset = Math.sin(i * 1.2) * 50;
                    const captor = players.find(p => p.id === c.capturedBy);
                    return (
                      <motion.div 
                        key={c.id} 
                        initial={{ scale: 0 }} 
                        animate={{ scale: 1 }} 
                        transition={{ delay: i * 0.1 }}
                        className="flex justify-center relative cursor-pointer group"
                        style={{ transform: `translateX(${offset}px)` }}
                        onClick={() => startTurn(c)}
                      >
                         <div className={cn(
                           "w-24 h-24 rounded-full border-b-8 flex items-center justify-center transition-all",
                           c.capturedBy ? "border-b-0 translate-y-2" : "active:translate-y-2 active:border-b-0 border-gray-300 bg-white hover:bg-gray-50"
                         )}
                         style={captor ? { backgroundColor: captor.color, boxShadow: `0 0 30px ${captor.color}90`, border: `4px solid white` } : undefined}>
                           {captor ? <Play className="text-white w-10 h-10 fill-current" /> : <span className="font-black text-gray-400 text-3xl">{i+1}</span>}
                         </div>
                         {c.isTie && (
                           <div className="absolute -top-2 -right-2 bg-duo-red text-white text-xs font-black px-2 py-1 rounded-full animate-bounce shadow-md">TIE!</div>
                         )}
                         <div className="absolute top-1/2 left-full ml-4 -translate-y-1/2 bg-white px-3 py-2 rounded-xl shadow-sm border border-gray-100 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                           <p className="font-bold text-sm text-gray-700">{c.name}</p>
                         </div>
                      </motion.div>
                    );
                 })}
               </div>
             </motion.div>
          )}

          {screen === 'HANDOFF' && (
            <motion.div initial={{scale:0.8, opacity:0}} animate={{scale:1, opacity:1}} className="flex flex-col h-full justify-center items-center text-center gap-8 px-6 absolute inset-0 bg-white z-50">
               <h1 className="text-4xl font-black text-gray-800">Hand phone to</h1>
               <h2 className="text-6xl font-black" style={{color: players.find(p=>p.id === activePlayer)?.color}}>
                 {players.find(p=>p.id === activePlayer)?.name}
               </h2>
               
               {!hasSeenIntro[activePlayer] && (
                 <div className="bg-gray-100 p-6 rounded-3xl mt-4 border-2 border-gray-200">
                   <Info className="w-8 h-8 text-duo-purple mx-auto mb-2" />
                   <p className="font-bold text-gray-600 italic text-sm">{introText}</p>
                 </div>
               )}

               <Button className="mt-8" onClick={() => {
                 setHasSeenIntro(prev => ({...prev, [activePlayer]: true}));
                 setScreen('PROMPT_ENTRY');
               }}>Ready</Button>
            </motion.div>
          )}

          {screen === 'PROMPT_ENTRY' && activeCategory && (
            <motion.div initial={{y:50, opacity:0}} animate={{y:0, opacity:1}} className="flex flex-col h-full relative pt-2">
               <div className="bg-white rounded-3xl p-5 mb-4 shadow-sm border-2 border-gray-100">
                  <h3 className="font-black text-xl mb-1 text-gray-800">{activeCategory.name}</h3>
                  <p className="text-gray-500 font-semibold text-sm">{activeCategory.description}</p>
                  {activeCategory.isTie && (
                    <div className="mt-3 bg-duo-red/10 text-duo-red p-3 rounded-xl font-bold text-sm">
                      Follow-up Battle! The Overseer demands more. Build upon your last prompt.
                    </div>
                  )}
               </div>
               <textarea 
                  className="flex-1 w-full bg-white rounded-3xl border-2 border-gray-200 p-5 font-bold text-lg outline-none focus:border-duo-blue resize-none mb-4 shadow-inner"
                  placeholder="Weave your lies..."
                  value={activePlayer === 'player_1' ? p1Draft : p2Draft}
                  onChange={e => activePlayer === 'player_1' ? setP1Draft(e.target.value) : setP2Draft(e.target.value)}
                  spellCheck
               />
               <div className="flex gap-3 shrink-0">
                 <Button variant="ghost" onClick={() => setScreen('BATTLE_PATH')}>Back</Button>
                 <Button onClick={() => {
                   if (activePlayer === 'player_1') {
                     setActivePlayer('player_2');
                     setScreen('HANDOFF');
                   } else {
                     resolveTurn();
                   }
                 }}>Done</Button>
               </div>
            </motion.div>
          )}

          {screen === 'RESOLVING' && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col h-full justify-center items-center text-center gap-6">
               <div className="w-24 h-24 border-8 border-duo-purple border-t-transparent rounded-full animate-spin"></div>
               <h2 className="text-3xl font-black text-gray-800 animate-pulse">The Overseer Judges...</h2>
            </motion.div>
          )}

          {screen === 'RESULTS_MODAL' && judgingResult && (
             <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} className="flex flex-col h-full overflow-y-auto scrollbar-hide pb-10">
                <h2 className="text-3xl font-black text-center mb-6 text-gray-800">Judgment</h2>
                
                <div className="space-y-4 mb-6">
                  <div className="bg-white p-5 rounded-3xl shadow-sm border-l-8" style={{borderColor: players[0].color}}>
                    <p className="font-bold text-sm text-gray-400 mb-2">{players[0].name}</p>
                    <p className="font-bold text-gray-800">{p1Draft}</p>
                  </div>
                  <div className="bg-white p-5 rounded-3xl shadow-sm border-l-8" style={{borderColor: players[1].color}}>
                    <p className="font-bold text-sm text-gray-400 mb-2">{players[1].name}</p>
                    <p className="font-bold text-gray-800">{p2Draft}</p>
                  </div>
                </div>

                <div className="bg-gray-800 rounded-3xl p-6 shadow-xl relative overflow-hidden mb-6">
                   <div className="absolute top-0 left-0 w-full h-2 bg-duo-purple"></div>
                   <h3 className="font-black text-duo-purple mb-4 text-xl">The Overseer Speaks</h3>
                   <div className="space-y-4">
                     <p className="text-white font-bold leading-relaxed">{judgingResult.player_1_feedback}</p>
                     <p className="text-white font-bold leading-relaxed">{judgingResult.player_2_feedback}</p>
                     <p className="text-duo-yellow font-black text-xl mt-6">{judgingResult.verdict_sentence}</p>
                   </div>
                </div>

                <Button variant="primary" onClick={completeTurn}>Continue</Button>
             </motion.div>
          )}

          {screen === 'WIN_SCREEN' && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col h-full relative">
              <div className="text-center mb-6 shrink-0">
                <Trophy className="w-16 h-16 text-duo-yellow mx-auto mb-2" />
                <h1 className="text-4xl font-black text-gray-800">Game Over</h1>
                <p className="text-gray-500 font-bold mt-2">The realm has a new King.</p>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8 scrollbar-hide pb-20">
                {categories.map((cat, i) => (
                  <div key={cat.id} className="bg-white rounded-3xl p-5 shadow-sm border-2 border-gray-100">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b-2 border-gray-100">
                      <div>
                        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Category {i + 1}</span>
                        <h3 className="font-black text-xl text-gray-800 leading-tight">{cat.name}</h3>
                      </div>
                      {cat.capturedBy && (
                        <div className="w-8 h-8 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: players.find(p => p.id === cat.capturedBy)?.color }} />
                      )}
                    </div>
                    
                    <div className="space-y-6">
                      {cat.history.map((log, hIndex) => (
                        <div key={hIndex} className="space-y-3">
                          {cat.history.length > 1 && <div className="text-center text-xs font-bold text-gray-400 uppercase">Round {hIndex + 1}</div>}
                          
                          <div className="bg-gray-50 p-3 rounded-2xl border-l-4" style={{borderColor: players[0].color}}>
                            <span className="text-xs font-black text-gray-400 block mb-1">{players[0].name}</span>
                            <p className="font-bold text-sm text-gray-700">{log.player1Text}</p>
                          </div>
                          
                          <div className="bg-gray-50 p-3 rounded-2xl border-l-4" style={{borderColor: players[1].color}}>
                            <span className="text-xs font-black text-gray-400 block mb-1">{players[1].name}</span>
                            <p className="font-bold text-sm text-gray-700">{log.player2Text}</p>
                          </div>
                          
                          <div className="bg-duo-purple/10 p-4 rounded-2xl">
                            <span className="text-xs font-black text-duo-purple uppercase block mb-2">Overseer's Verdict</span>
                            <p className="font-bold text-sm text-gray-800">{log.judgingLog.verdict_sentence}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-duo-gray via-duo-gray to-transparent pb-6 pt-10">
                <Button variant="ghost" className="bg-white border-2 border-gray-200" onClick={() => setScreen('BATTLE_PATH')}>
                  View Board
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Category Creation / Edit Modal */}
      <AnimatePresence>
        {showCatModal && (
          <motion.div 
            initial={{opacity: 0}} 
            animate={{opacity: 1}} 
            exit={{opacity: 0}} 
            className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-gray-900/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{scale: 0.9, y: 20}} 
              animate={{scale: 1, y: 0}} 
              exit={{scale: 0.9, y: 20}} 
              className="bg-white rounded-3xl w-full max-w-sm flex flex-col overflow-hidden shadow-2xl border-2 border-white"
            >
              <div className="flex justify-between items-center p-4 border-b-2 border-gray-100 bg-gray-50">
                <h3 className="font-black text-xl text-gray-800">{editingCat ? 'Edit Category' : 'New Category'}</h3>
                <button onClick={() => setShowCatModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-2 mb-1 block">Category Name</label>
                  <input 
                    type="text" 
                    value={catNameInput}
                    onChange={(e) => setCatNameInput(e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 font-bold outline-none focus:border-duo-blue focus:bg-white transition-all text-gray-800"
                    placeholder="e.g. The Infinite Loop"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-2 mb-1 block">Description</label>
                  <textarea 
                    value={catDescInput}
                    onChange={(e) => setCatDescInput(e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 font-bold outline-none focus:border-duo-blue focus:bg-white transition-all resize-none h-32 text-gray-800"
                    placeholder="Set the scene..."
                  />
                </div>
              </div>

              <div className="p-5 pt-0">
                <Button variant="primary" onClick={saveCategory} className="flex items-center justify-center gap-2">
                  <Check className="w-6 h-6" /> Save
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}