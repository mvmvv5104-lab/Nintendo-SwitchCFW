class Chip8 {
  constructor(canvas, beepCallback) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.beepCallback = beepCallback || function(){};
    this.scale = Math.floor(Math.min(canvas.width / 64, canvas.height / 32));
    this.keys = new Array(16).fill(false);
    this.waitingForKey = false;
    this.reset();
  }

  reset() {
    this.memory = new Uint8Array(4096);
    this.V = new Uint8Array(16);
    this.I = 0;
    this.pc = 0x200;
    this.stack = [];
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.gfx = new Uint8Array(64 * 32);
    this.running = false;
    this.paused = false;
    this.drawFlag = true;
    this.speed = 10;

    const fontset = [
      0xF0,0x90,0x90,0x90,0xF0, 0x20,0x60,0x20,0x20,0x70,
      0xF0,0x10,0xF0,0x80,0xF0, 0xF0,0x10,0xF0,0x10,0xF0,
      0x90,0x90,0xF0,0x10,0x10, 0xF0,0x80,0xF0,0x10,0xF0,
      0xF0,0x80,0xF0,0x90,0xF0, 0xF0,0x10,0x20,0x40,0x40,
      0xF0,0x90,0xF0,0x90,0xF0, 0xF0,0x90,0xF0,0x10,0xF0,
      0xF0,0x90,0xF0,0x90,0x90, 0xE0,0x90,0xE0,0x90,0xE0,
      0xF0,0x80,0x80,0x80,0xF0, 0xE0,0x90,0x90,0x90,0xE0,
      0xF0,0x80,0xF0,0x80,0xF0, 0xF0,0x80,0xF0,0x80,0x80
    ];
    this.memory.set(fontset, 0x50);
    this.clearScreen();
  }

  loadRom(buffer) {
    this.reset();
    const rom = new Uint8Array(buffer);
    this.memory.set(rom, 0x200);
    this.running = true;
  }

  setKey(index, pressed) {
    if (index < 0 || index > 15) return;
    this.keys[index] = pressed;
    if (pressed && this.waitingForKey !== false) {
      this.V[this.waitingForKey] = index;
      this.waitingForKey = false;
      this.pc += 2;
    }
  }

  cycle() {
    if (!this.running || this.paused || this.waitingForKey !== false) return;

    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    const x = (opcode & 0x0F00) >> 8;
    const y = (opcode & 0x00F0) >> 4;
    const n = opcode & 0x000F;
    const nn = opcode & 0x00FF;
    const nnn = opcode & 0x0FFF;

    this.pc += 2;

    switch (opcode & 0xF000) {
      case 0x0000:
        if (opcode === 0x00E0) this.clearScreen();
        else if (opcode === 0x00EE) this.pc = this.stack.pop() || 0x200;
        break;
      case 0x1000: this.pc = nnn; break;
      case 0x2000: this.stack.push(this.pc); this.pc = nnn; break;
      case 0x3000: if (this.V[x] === nn) this.pc += 2; break;
      case 0x4000: if (this.V[x] !== nn) this.pc += 2; break;
      case 0x5000: if (n === 0 && this.V[x] === this.V[y]) this.pc += 2; break;
      case 0x6000: this.V[x] = nn; break;
      case 0x7000: this.V[x] = (this.V[x] + nn) & 0xFF; break;
      case 0x8000:
        switch (n) {
          case 0x0: this.V[x] = this.V[y]; break;
          case 0x1: this.V[x] |= this.V[y]; break;
          case 0x2: this.V[x] &= this.V[y]; break;
          case 0x3: this.V[x] ^= this.V[y]; break;
          case 0x4: {
            const sum = this.V[x] + this.V[y];
            this.V[0xF] = sum > 255 ? 1 : 0;
            this.V[x] = sum & 0xFF;
            break;
          }
          case 0x5:
            this.V[0xF] = this.V[x] >= this.V[y] ? 1 : 0;
            this.V[x] = (this.V[x] - this.V[y]) & 0xFF;
            break;
          case 0x6:
            this.V[0xF] = this.V[x] & 1;
            this.V[x] >>= 1;
            break;
          case 0x7:
            this.V[0xF] = this.V[y] >= this.V[x] ? 1 : 0;
            this.V[x] = (this.V[y] - this.V[x]) & 0xFF;
            break;
          case 0xE:
            this.V[0xF] = (this.V[x] & 0x80) ? 1 : 0;
            this.V[x] = (this.V[x] << 1) & 0xFF;
            break;
        }
        break;
      case 0x9000: if (n === 0 && this.V[x] !== this.V[y]) this.pc += 2; break;
      case 0xA000: this.I = nnn; break;
      case 0xB000: this.pc = nnn + this.V[0]; break;
      case 0xC000: this.V[x] = (Math.floor(Math.random() * 256) & nn); break;
      case 0xD000: this.drawSprite(this.V[x], this.V[y], n); break;
      case 0xE000:
        if (nn === 0x9E && this.keys[this.V[x]]) this.pc += 2;
        if (nn === 0xA1 && !this.keys[this.V[x]]) this.pc += 2;
        break;
      case 0xF000:
        switch (nn) {
          case 0x07: this.V[x] = this.delayTimer; break;
          case 0x0A: this.waitingForKey = x; this.pc -= 2; break;
          case 0x15: this.delayTimer = this.V[x]; break;
          case 0x18: this.soundTimer = this.V[x]; break;
          case 0x1E: this.I = (this.I + this.V[x]) & 0xFFF; break;
          case 0x29: this.I = 0x50 + (this.V[x] & 0xF) * 5; break;
          case 0x33:
            this.memory[this.I] = Math.floor(this.V[x] / 100);
            this.memory[this.I + 1] = Math.floor((this.V[x] % 100) / 10);
            this.memory[this.I + 2] = this.V[x] % 10;
            break;
          case 0x55:
            for (let i = 0; i <= x; i++) this.memory[this.I + i] = this.V[i];
            break;
          case 0x65:
            for (let i = 0; i <= x; i++) this.V[i] = this.memory[this.I + i];
            break;
        }
        break;
    }
  }

  tickTimers() {
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) {
      this.soundTimer--;
      this.beepCallback();
    }
  }

  clearScreen() {
    this.gfx.fill(0);
    this.drawFlag = true;
  }

  drawSprite(x, y, height) {
    this.V[0xF] = 0;
    for (let row = 0; row < height; row++) {
      const sprite = this.memory[this.I + row];
      for (let col = 0; col < 8; col++) {
        if ((sprite & (0x80 >> col)) !== 0) {
          const px = (x + col) % 64;
          const py = (y + row) % 32;
          const idx = px + py * 64;
          if (this.gfx[idx] === 1) this.V[0xF] = 1;
          this.gfx[idx] ^= 1;
        }
      }
    }
    this.drawFlag = true;
  }

  render() {
    if (!this.drawFlag) return;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#fff';
    const s = this.scale;
    const offX = Math.floor((this.canvas.width - 64 * s) / 2);
    const offY = Math.floor((this.canvas.height - 32 * s) / 2);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 64; x++) {
        if (this.gfx[x + y * 64]) this.ctx.fillRect(offX + x * s, offY + y * s, s, s);
      }
    }
    this.drawFlag = false;
  }
}
