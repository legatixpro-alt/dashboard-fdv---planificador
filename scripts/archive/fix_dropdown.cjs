const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const oldHeaderEnd = `          {/* PERFIL DEL VENDEDOR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto pb-2 xl:pb-0">
            <div className="flex flex-1 sm:flex-none items-center justify-between sm:justify-start gap-3 bg-neutral-950 border border-neutral-800 rounded-xl md:rounded-full px-4 py-2.5 min-h-[44px] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <UserCircle className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-sans text-neutral-500 leading-none uppercase tracking-wider mb-0.5">Vendedor Activo</span>
                  <span className="text-sm font-sans font-bold text-white leading-none">HERNAN PAZ</span>
                </div>
              </div>
            </div>
          </div>
        </header>`;

const newHeaderEnd = `          {/* PERFIL DEL VENDEDOR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto pb-2 xl:pb-0">
            <div className="flex flex-1 sm:flex-none items-center justify-between sm:justify-start gap-3 bg-neutral-950 border border-neutral-800 rounded-xl md:rounded-full px-4 py-2.5 min-h-[44px] shrink-0">
              <div className="flex items-center gap-2 w-full">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <UserCircle className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-[10px] font-sans text-neutral-500 leading-none uppercase tracking-wider mb-0.5">Vendedor Activo</span>
                  <select 
                    value={activeVendedorId}
                    onChange={(e) => setActiveVendedorId(e.target.value)}
                    className="bg-transparent text-sm font-sans font-bold text-white leading-none outline-none appearance-none cursor-pointer"
                  >
                    <option value="ADMIN">TODOS LOS VENDEDORES (ADMIN)</option>
                    {vendedoresList.map(v => (
                      <option key={v} value={v} className="bg-neutral-900">{v}</option>
                    ))}
                  </select>
                </div>
                <ChevronDown className="w-4 h-4 text-neutral-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </header>`;

content = content.replace(oldHeaderEnd, newHeaderEnd);
fs.writeFileSync('src/App.tsx', content);
