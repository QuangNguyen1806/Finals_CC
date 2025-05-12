// === CONFIG & STATE ===
const cols            = 20;
const rows            = 20;
const cellSize        = 30;
const LIGHT_RADIUS    = 75;
const OVERLAY_OPACITY = 0.1;

let grid = [];
let stack = [];
let current;

let startTime, lastMazeRegen;
const REGEN_INTERVAL  = 90000;
const POPUP_DURATION  = 2000;

let regenPopup     = false;
let popupStartTime = 0;

const MAX_SCORE     = 100000;
const SCORE_DECR    = 1000;
const DECR_INTERVAL = 2000;
let scoreDiv;

let player = {
  x: 0, y: 0,
  speed: 2,
  speedMult: 1,
  speedExpires: 0,
  canJump: false,
  jumpCount: 0,
  illumExpires: 0
};

let enemies  = [];
let traps    = [];
let powerUps = [];

// UI / flow state
let gameState   = 'menu';   // 'menu' | 'play' | 'info' | 'credits'
let paused      = false;
let gameOver    = false;
let gameOverMsg = '';
const buttons   = [];


// === p5.js SETUP & MAIN DRAW ===

function setup() {
  createCanvas(cols * cellSize, rows * cellSize);
  textFont('Courier New');
  scoreDiv = createDiv('')
    .style('font-size','18px')
    .position(10, rows*cellSize - 30);

  // Build initial maze & place player + entities
  generateMaze();
  player.x = cellSize/2;
  player.y = cellSize/2;
  resetEntities(false);

  setupMenuButtons();
}

function draw() {
  background(0);

  if (gameState === 'menu')      drawMenu();
  else if (gameState === 'info') drawInfoScreen();
  else if (gameState === 'credits') drawCreditsScreen();
  else if (gameState === 'play') drawPlay();
}

function keyPressed() {
  // P to pause/unpause
  if ((key==='P' || key==='p') && gameState==='play' && !gameOver) {
    paused ? loop() : noLoop();
    paused = !paused;
  }
}

function mousePressed() {
  // Dispatch any button clicks
  for (let b of buttons) {
    if (
      mouseX > b.x - b.w/2 && mouseX < b.x + b.w/2 &&
      mouseY > b.y - b.h/2 && mouseY < b.y + b.h/2
    ) {
      b.cb();
      return;
    }
  }
}


// === BUTTON BUILDER ===

function addButton(x, y, label, cb) {
  buttons.push({ x,y, w:160, h:40, label, cb });
  fill(50); stroke(255);
  rectMode(CENTER); rect(x,y,160,40,6);
  noStroke(); fill(255);
  textSize(20); textAlign(CENTER,CENTER);
  text(label, x, y);
}


// === MENU / INFO / CREDITS SCREENS ===

function setupMenuButtons() {
  buttons.length = 0;
  const cx = width/2, sy = height/2 - 30, gap = 50;
  addButton(cx,       sy,      'Start',   ()=>{ resetGame(); gameState='play'; });
  addButton(cx,       sy+gap,  'Info',    ()=>{ gameState='info'; });
  addButton(cx,       sy+2*gap,'Credits', ()=>{ gameState='credits'; });
}

function drawMenu() {
  buttons.length = 0;
  setupMenuButtons();
  fill(255); textAlign(CENTER,CENTER); textSize(48);
  text('Maze of Shadows', width/2, height/4);
}

function drawInfoScreen() {
  buttons.length = 0;
  fill(255); textAlign(LEFT,TOP); textSize(20);
  const lines = [
    'Game Info:',
    '- Navigate by torchlight.',
    '- Red traps flip walls.',
    '- Enemies patrol in circles—avoid them!',
    '- Speed Potion doubles speed for 5s.',
    '- Illumination Potion reveals full maze for 10s',
    '- Every 90s maze & entities regenerate.'
  ];
  for (let i=0; i<lines.length; i++) {
    text(lines[i], 40, 40 + i*30);
  }
  addButton(width/2, height-40, 'Back', ()=> gameState='menu');
}

function drawCreditsScreen() {
  buttons.length = 0;
  fill(255); textAlign(CENTER,TOP); textSize(24);
  text('Created by Quang Nguyen\nPowered by p5.js', width/2, 40);
  addButton(width/2, height-40, 'Back', ()=> gameState='menu');
}


// === MAIN PLAY LOOP ===

function drawPlay() {
  buttons.length = 0;

  if (paused) {
    fill(0,150); rect(0,0,width,height);
    fill(255); textAlign(CENTER,CENTER); textSize(48);
    text('Paused', width/2, height/2);
    addButton(width/2, height/2+60, 'Resume', ()=> keyPressed({key:'P'}));
    return;
  }

  const now     = millis();
  const elapsed = now - startTime;

  // Regenerate maze + entities
  if (now - lastMazeRegen > REGEN_INTERVAL) {
    generateMaze();
    lastMazeRegen = now;
    regenPopup     = true;
    popupStartTime = now;
    resetEntities(false);
  }

  // Expire speed
  if (player.speedMult > 1 && now > player.speedExpires) {
    player.speedMult = 1;
  }
  const illumActive = now < player.illumExpires;

  // Draw core game
  drawMaze();
  updateEnemies();
  drawTraps();
  drawPowerUps();
  handleMovement();
  drawPlayer();
  drawTorchFlame();

  // Collisions & exit
  if (!gameOver) {
    checkEnemyCollision();
    checkTrapCollision();
    checkPowerUpCollision();
    checkExit();
  }

  // Game Over overlay
  if (gameOver) {
    fill(0, 150); // Semi-transparent dark overlay
    rect(0, 0, width, height);
    fill(255); 
    textAlign(CENTER, CENTER); 
    textSize(48);
    text(gameOverMsg, width/2, height/2 - 40);
    addButton(width/2, height/2 + 20, 'Restart', resetGame);
    addButton(width/2, height/2 + 80, 'Menu', () => gameState = 'menu');
    return;
  }

  // Regen popup
  if (regenPopup && now - popupStartTime < POPUP_DURATION) {
    fill(255,255,0); textAlign(CENTER,CENTER); textSize(32);
    text('New Maze Generated!', width/2, height/2);
  } else {
    regenPopup = false;
  }

  // Torch mask or full view
  if (!illumActive) drawTorchMask();

  // HUD & pause button
  fill(255); textSize(18); textAlign(LEFT,TOP);
  text(`Time: ${nf(floor(elapsed/1000),3)}s`, 10, 10);
  const steps = floor(elapsed / DECR_INTERVAL);
  const score = max(0, MAX_SCORE - steps * SCORE_DECR);
  scoreDiv.html(`Score: ${score}`);
}


// === RESET & RESTART HELPERS ===

function resetEntities(resetPlayer=true) {
  if (resetPlayer) {
    player.x = cellSize/2;
    player.y = cellSize/2;
  }
  player.speedMult    = 1;
  player.canJump      = false;
  player.jumpCount    = 0;
  player.illumExpires = 0;

  // random enemies
  enemies = [];
  for (let i=0; i<4; i++) {
    const ci = floor(random(cols));
    const cj = floor(random(rows));
    const x  = ci*cellSize + cellSize/2;
    const y  = cj*cellSize + cellSize/2;
    const range = cellSize * floor(random(1,4));
    enemies.push(new Enemy(x,y,range));
  }

  // random traps
  traps = [];
  for (let i=0; i<5; i++) {
    traps.push(new Trap(floor(random(cols)), floor(random(rows))));
  }

  // random power-ups
  powerUps = [];
  ['speed','illum'].forEach(type => {
    powerUps.push(new PowerUp(
      floor(random(cols)), floor(random(rows)), type
    ));
  });
}

function resetGame() {
  startTime     = millis();
  lastMazeRegen = millis();
  generateMaze();
  resetEntities(true);
  gameOver    = false;
  paused      = false;
  loop();
  gameState   = 'play';
}


// === MOVEMENT & COLLISION ===

function handleMovement(){
  if(millis()<player.illumExpires||gameOver) return;
  let vx=0, vy=0;
  if (keyIsDown(LEFT_ARROW))  vx = -player.speed * player.speedMult;
  if (keyIsDown(RIGHT_ARROW)) vx =  player.speed * player.speedMult;
  if (keyIsDown(UP_ARROW))    vy = -player.speed * player.speedMult;
  if (keyIsDown(DOWN_ARROW))  vy =  player.speed * player.speedMult;
  moveAxis(vx,vy);
}

function moveAxis(vx,vy){
  if(!vx&&!vy) return;
  const newX = player.x+vx, newY = player.y+vy;
  const col = floor(player.x/cellSize), row = floor(player.y/cellSize);
  const c   = grid[row*cols + col];
  const blocked = (vx>0&&c.walls[1])||(vx<0&&c.walls[3])||(vy>0&&c.walls[2])||(vy<0&&c.walls[0]);
  if(blocked){
    if(player.jumpCount>0) player.jumpCount--;
    else return;
  }
  player.x = newX; player.y = newY;
}


// === DRAW PLAYER ===

function drawPlayer() {
  fill(255,0,0);
  noStroke();
  ellipse(player.x, player.y, 0.6*cellSize);
}


// === POWER-UP, ENEMY, TRAP CLASSES & FUNCTIONS ===

class PowerUp {
  constructor(ci, cj, type) {
    this.ci = ci; this.cj = cj; this.type = type;
    this.active = true; this.size = cellSize*0.6;
    this.colors = { speed:color(0,255,255), jump:color(255,0,255), illum:color(255,255,0) };
  }
  show() { if(!this.active) return; fill(this.colors[this.type]); noStroke(); ellipse(this.ci*cellSize+cellSize/2, this.cj*cellSize+cellSize/2, this.size); }
  apply() {
    this.active = false;
    const now = millis();
    if(this.type==='speed'){ player.speedMult=2; player.speedExpires=now+5000; }
    else if(this.type==='illum'){ player.illumExpires=now+10000; }
  }
}
function drawPowerUps(){ powerUps.forEach(p=>p.show()); }
function checkPowerUpCollision(){ powerUps.forEach(p=>{ if(p.active && dist(player.x,player.y,p.ci*cellSize+cellSize/2,p.cj*cellSize+cellSize/2)<p.size/2) p.apply(); }); }

class Enemy {
  constructor(x,y,range){ this.start=createVector(x,y); this.pos=this.start.copy(); this.range=range; this.angle=0; this.speed=0.02; this.size=cellSize*0.6; }
  update(){ this.angle+=this.speed; this.pos.x=this.start.x+cos(this.angle)*this.range; this.pos.y=this.start.y+sin(this.angle)*this.range; }
  show(){ fill(0,0,255); noStroke(); ellipse(this.pos.x,this.pos.y,this.size); }
}
function updateEnemies(){ enemies.forEach(e=>{ e.update(); e.show(); }); }
function checkEnemyCollision(){ enemies.forEach(e=>{ if(dist(player.x,player.y,e.pos.x,e.pos.y)<cellSize*0.6) lose('Caught by Enemy!'); }); }

class Trap {
  constructor(ci,cj){ this.ci=ci; this.cj=cj; this.active=true; this.size=cellSize; }
  show(){ if(!this.active) return; fill(200,50,50); noStroke(); rect(this.ci*cellSize,this.cj*cellSize,this.size,this.size); }
  trigger(){ const cell=grid[index(this.ci,this.cj)]; cell.walls=cell.walls.map(w=>!w); this.active=false; }
}
function drawTraps(){ traps.forEach(t=>t.show()); }
function checkTrapCollision(){ traps.forEach(t=>{ if(t.active && player.x>t.ci*cellSize && player.x<(t.ci+1)*cellSize && player.y>t.cj*cellSize && player.y<(t.cj+1)*cellSize) t.trigger(); }); }


// Movement with jump logic
function handleMovement(){ if(millis()<player.illumExpires) return; let vx=0,vy=0; if(keyIsDown(LEFT_ARROW)) vx=-player.speed*player.speedMult; if(keyIsDown(RIGHT_ARROW)) vx=player.speed*player.speedMult; if(keyIsDown(UP_ARROW)) vy=-player.speed*player.speedMult; if(keyIsDown(DOWN_ARROW)) vy=player.speed*player.speedMult; moveAxis(vx,vy);} 
function moveAxis(vx,vy){ if(!vx&&!vy) return; const newX=player.x+vx, newY=player.y+vy; const col=floor(player.x/cellSize), row=floor(player.y/cellSize); const c=grid[row*cols+col]; const blocked=(vx>0&&c.walls[1])||(vx<0&&c.walls[3])||(vy>0&&c.walls[2])||(vy<0&&c.walls[0]); if(blocked){ if(player.canJump&&player.jumpCount>0){ player.jumpCount--; player.canJump=false; } else return; } player.x=newX; player.y=newY; }

function drawPlayer(){ fill(255,0,0); noStroke(); ellipse(player.x,player.y,0.6*cellSize); }
function lose(msg){ noLoop(); fill(255,0,0); textAlign(CENTER,CENTER); textSize(48); text(msg,width/2,height/2); }


function drawTorchMask() {
  const ctx = drawingContext;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${OVERLAY_OPACITY})`;
  ctx.fillRect(0,0,width,height);
  const grad = ctx.createRadialGradient(
    player.x, player.y, LIGHT_RADIUS*0.1,
    player.x, player.y, LIGHT_RADIUS);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(0.7,'rgba(0,0,0,0)');
  grad.addColorStop(1.0,`rgba(0,0,0,${OVERLAY_OPACITY})`);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,width,height);
  ctx.restore();
}


function drawTorchFlame() {
  // simple flickering flame above the player
  push();
  translate(player.x, player.y);
  noStroke();
  // draw torch handle
  push();
    rotate(radians(45));  // angle it
    fill(100);
    rect(-3, cellSize*0.3, 6, cellSize*0.8);
  pop();
  // flame layers
  for (let i = 0; i < 3; i++) {
    const offsetX = random(-4, 4);
    const offsetY = random(-8, -20);
    const size    = random(cellSize*0.3, cellSize*0.5);
    const alpha   = random(150, 255);
    // color shifts from yellow to red
    const r = lerp(255, 255, i/2);
    const g = lerp(200,  50, i/2);
    const b = 0;
    fill(r, g, b, alpha);
    ellipse(offsetX, offsetY, size, size*1.2);
  }
  pop();
}


function generateMaze() {
  grid = [];
  stack = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      grid.push(new Cell(i, j));
    }
  }
  current = grid[0];
  current.visited = true;
  stack.push(current);
  while (stack.length > 0) {
    let next = current.checkNeighbors();
    if (next) {
      next.visited = true;
      stack.push(current);
      Cell.removeWalls(current, next);
      current = next;
    } else {
      current = stack.pop();
    }
  }
}

function drawMaze() {
  for (let cell of grid) cell.show();
  // exit indicator
  let ex = (cols - 1) * cellSize;
  let ey = (rows - 1) * cellSize - 40;
  fill(0,255,0);
  noStroke();
  rect(ex + 0.2*cellSize, ey + 0.2*cellSize, 0.6*cellSize, 0.6*cellSize);
}

function drawPlayer() {
  fill(255,0,0);
  noStroke();
  ellipse(player.x, player.y, 0.6*cellSize);
}

function handleMovement() {
  let vx=0, vy=0;
  if (keyIsDown(LEFT_ARROW))  vx=-player.speed;
  if (keyIsDown(RIGHT_ARROW)) vx= player.speed;
  if (keyIsDown(UP_ARROW))    vy=-player.speed;
  if (keyIsDown(DOWN_ARROW))  vy= player.speed;

  // horizontal
  if (vx !== 0) {
    let newX    = player.x + vx;
    let col     = floor(player.x / cellSize);
    let row     = floor(player.y / cellSize);
    let nextCol = floor(newX / cellSize);
    let c       = grid[row*cols + col];
    if ((vx>0 && !c.walls[1]) || (vx<0 && !c.walls[3]) || nextCol === col) {
      player.x = newX;
    }
  }
  // vertical
  if (vy !== 0) {
    let newY    = player.y + vy;
    let col     = floor(player.x / cellSize);
    let row     = floor(player.y / cellSize);
    let nextRow = floor(newY / cellSize);
    let c       = grid[row*cols + col];
    if ((vy>0 && !c.walls[2]) || (vy<0 && !c.walls[0]) || nextRow === row) {
      player.y = newY;
    }
  }
}

function checkExit() {
  let ex = (cols-1)*cellSize + cellSize/2;
  let ey = (rows-1)*cellSize + cellSize/2 - 40;
  if (dist(player.x, player.y, ex, ey) < 0.3*cellSize) {
    noLoop();
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(48);
    text('You Escaped!', width/2, height/2 - 20);

    const finalElapsed = millis() - startTime;
    const finalT       = floor(finalElapsed/1000);
    const finalSteps   = floor(finalElapsed/DECR_INTERVAL);
    const finalScore   = max(0, MAX_SCORE - finalSteps * SCORE_DECR);

    textSize(24);
    text(`Time: ${nf(finalT,3)}s`, width/2, height/2 + 20);
    text(`Score: ${finalScore}`, width/2, height/2 + 50);
  }
}

function index(i,j) {
  if (i<0||j<0||i>=cols||j>=rows) return -1;
  return i + j*cols;
}

class Cell {
  constructor(i,j) {
    this.i = i;
    this.j = j;
    this.walls = [true,true,true,true];
    this.visited = false;
  }
  show() {
    let x = this.i * cellSize, y = this.j * cellSize;
    stroke(255);
    if (this.walls[0]) line(x,y, x+cellSize, y);
    if (this.walls[1]) line(x+cellSize,y, x+cellSize, y+cellSize);
    if (this.walls[2]) line(x+cellSize,y+cellSize, x, y+cellSize);
    if (this.walls[3]) line(x, y+cellSize, x, y);
  }
  checkNeighbors() {
    let neighbors = [];
    const top    = grid[index(this.i, this.j-1)];
    const right  = grid[index(this.i+1, this.j)];
    const bottom = grid[index(this.i, this.j+1)];
    const left   = grid[index(this.i-1, this.j)];
    if (top    && !top.visited)    neighbors.push(top);
    if (right  && !right.visited)  neighbors.push(right);
    if (bottom && !bottom.visited) neighbors.push(bottom);
    if (left   && !left.visited)   neighbors.push(left);
    return neighbors.length > 0 ? random(neighbors) : undefined;
  }
  static removeWalls(a,b) {
    let dx = a.i - b.i;
    if (dx === 1) { a.walls[3] = false; b.walls[1] = false; }
    else if (dx === -1) { a.walls[1] = false; b.walls[3] = false; }
    let dy = a.j - b.j;
    if (dy === 1) { a.walls[0] = false; b.walls[2] = false; }
    else if (dy === -1) { a.walls[2] = false; b.walls[0] = false; }
  }
}
