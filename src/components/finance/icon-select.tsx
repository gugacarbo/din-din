import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet.tsx";

import { useIsMobile } from "#/hooks/use-mobile.ts";
import { CATEGORY_ICONS } from "#/lib/finance.ts";
import { cn } from "#/lib/utils.ts";
import { categoryIcons } from "./presentation.tsx";

type IconKey = (typeof CATEGORY_ICONS)[number];

const iconDetails: Record<IconKey, { label: string; searchTerms: string[] }> = {
	BadgeDollarSign: {
		label: "Salário",
		searchTerms: ["renda", "receita", "trabalho", "pagamento"],
	},
	Baby: {
		label: "Bebê",
		searchTerms: ["filho", "criança", "infantil", "família"],
	},
	BaggageClaim: {
		label: "Bagagem",
		searchTerms: ["mala", "viagem", "aeroporto"],
	},
	Banknote: {
		label: "Dinheiro",
		searchTerms: ["espécie", "cash", "nota", "moeda"],
	},
	Bath: {
		label: "Banho",
		searchTerms: ["higiene", "casa", "bem-estar"],
	},
	Bitcoin: {
		label: "Bitcoin",
		searchTerms: ["criptomoeda", "crypto", "investimento"],
	},
	Bike: { label: "Bicicleta", searchTerms: ["bike", "transporte", "esporte"] },
	Bird: { label: "Ave", searchTerms: ["pássaro", "pet", "animal", "voar"] },
	BookOpen: { label: "Livros", searchTerms: ["leitura", "educação", "estudo"] },
	BriefcaseBusiness: {
		label: "Trabalho",
		searchTerms: ["emprego", "carreira", "salário", "empresa"],
	},
	Building2: {
		label: "Empresa",
		searchTerms: ["negócio", "escritório", "comercial"],
	},
	Bus: { label: "Ônibus", searchTerms: ["transporte", "viagem", "passagem"] },
	Calculator: {
		label: "Calculadora",
		searchTerms: ["contas", "orçamento", "finanças"],
	},
	Camera: { label: "Câmera", searchTerms: ["fotografia", "foto", "hobby"] },
	Car: {
		label: "Carro",
		searchTerms: ["transporte", "veículo", "combustível"],
	},
	Cat: { label: "Gato", searchTerms: ["pet", "animal", "felino", "bicho"] },
	CatFace: {
		label: "Rosto de gato",
		searchTerms: ["gato", "pet", "animal", "felino", "bicho"],
	},
	CatPlay: {
		label: "Gato brincando",
		searchTerms: ["gato", "pet", "animal", "felino", "brincar"],
	},
	CatSitting: {
		label: "Gato sentado",
		searchTerms: ["gato", "pet", "animal", "felino"],
	},
	ChefHat: {
		label: "Cozinha",
		searchTerms: ["comida", "alimentação", "restaurante", "receita"],
	},
	CircleDollarSign: {
		label: "Finanças",
		searchTerms: ["dinheiro", "receita", "pagamento"],
	},
	CircleEllipsis: {
		label: "Outros",
		searchTerms: ["geral", "variados", "diversos"],
	},
	CirclePlay: {
		label: "Vídeos",
		searchTerms: ["streaming", "filme", "entretenimento"],
	},
	ClipboardList: {
		label: "Planejamento",
		searchTerms: ["tarefas", "lista", "organização"],
	},
	Coffee: {
		label: "Café",
		searchTerms: ["lanche", "alimentação", "restaurante"],
	},
	CreditCard: {
		label: "Cartão",
		searchTerms: ["crédito", "pagamento", "fatura"],
	},
	Dog: { label: "Cachorro", searchTerms: ["pet", "animal", "cão", "bicho"] },
	Dumbbell: {
		label: "Academia",
		searchTerms: ["fitness", "exercício", "saúde", "esporte"],
	},
	Fish: { label: "Peixe", searchTerms: ["aquário", "pet", "animal", "mar"] },
	Flower2: {
		label: "Flores",
		searchTerms: ["jardim", "planta", "casa", "presente"],
	},
	Fuel: {
		label: "Combustível",
		searchTerms: ["gasolina", "carro", "transporte"],
	},
	Gamepad2: {
		label: "Jogos",
		searchTerms: ["game", "lazer", "entretenimento"],
	},
	Gift: {
		label: "Presentes",
		searchTerms: ["presente", "festa", "aniversário"],
	},
	GraduationCap: {
		label: "Educação",
		searchTerms: ["estudo", "curso", "faculdade", "escola"],
	},
	HeartPulse: {
		label: "Saúde",
		searchTerms: ["médico", "hospital", "bem-estar"],
	},
	Hotel: { label: "Hospedagem", searchTerms: ["hotel", "viagem", "pousada"] },
	House: { label: "Moradia", searchTerms: ["casa", "aluguel", "lar"] },
	Laptop: {
		label: "Computador",
		searchTerms: ["tecnologia", "trabalho", "estudo"],
	},
	Landmark: {
		label: "Banco",
		searchTerms: ["transferência", "conta", "financeiro"],
	},
	Music: { label: "Música", searchTerms: ["show", "assinatura", "lazer"] },
	Package: {
		label: "Encomendas",
		searchTerms: ["entrega", "correio", "compras"],
	},
	PawPrint: {
		label: "Pets",
		searchTerms: ["animal", "gato", "cachorro", "veterinário"],
	},
	Pill: { label: "Remédios", searchTerms: ["saúde", "farmácia", "médico"] },
	PiggyBank: {
		label: "Poupança",
		searchTerms: ["investimento", "reserva", "economia"],
	},
	Plane: { label: "Viagens", searchTerms: ["avião", "turismo", "férias"] },
	QrCode: {
		label: "Pix",
		searchTerms: ["transferência", "pagamento", "banco"],
	},
	Rabbit: { label: "Coelho", searchTerms: ["pet", "animal", "bicho"] },
	ReceiptText: {
		label: "Contas",
		searchTerms: ["boleto", "recibo", "despesa", "fatura"],
	},
	Shirt: { label: "Roupas", searchTerms: ["vestuário", "moda", "compras"] },
	ShoppingBag: {
		label: "Compras",
		searchTerms: ["loja", "produto", "consumo"],
	},
	ShoppingCart: {
		label: "Mercado",
		searchTerms: ["supermercado", "comida", "alimentação"],
	},
	Smartphone: {
		label: "Celular",
		searchTerms: ["telefone", "internet", "assinatura"],
	},
	Stethoscope: {
		label: "Médico",
		searchTerms: ["saúde", "consulta", "hospital"],
	},
	Syringe: { label: "Vacina", searchTerms: ["saúde", "médico", "farmácia"] },
	Tags: { label: "Categorias", searchTerms: ["etiquetas", "geral", "outros"] },
	Ticket: {
		label: "Eventos",
		searchTerms: ["ingresso", "cinema", "show", "lazer"],
	},
	TrendingUp: {
		label: "Investimentos",
		searchTerms: ["rendimento", "bolsa", "finanças"],
	},
	Trees: { label: "Árvores", searchTerms: ["natureza", "jardim", "planta"] },
	Turtle: { label: "Tartaruga", searchTerms: ["pet", "animal", "réptil"] },
	Tv: { label: "TV", searchTerms: ["televisão", "streaming", "filme"] },
	Umbrella: { label: "Chuva", searchTerms: ["clima", "tempo", "viagem"] },
	Utensils: {
		label: "Alimentação",
		searchTerms: ["comida", "restaurante", "refeição", "mercado"],
	},
	WalletCards: {
		label: "Carteira",
		searchTerms: ["cartão", "pagamento", "dinheiro"],
	},
	Wrench: {
		label: "Manutenção",
		searchTerms: ["reparo", "conserto", "casa", "carro"],
	},
};

function normalizeSearch(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("pt-BR")
		.trim();
}

function IconGrid({
	value,
	onValueChange,
	search,
}: {
	value: string;
	onValueChange: (value: string) => void;
	search: string;
}) {
	const visibleIcons = useMemo(() => {
		const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
		if (terms.length === 0) return CATEGORY_ICONS;

		return CATEGORY_ICONS.filter((icon) => {
			const detail = iconDetails[icon];
			const searchableText = normalizeSearch(
				[icon, detail.label, ...detail.searchTerms].join(" "),
			);
			return terms.every((term) => searchableText.includes(term));
		});
	}, [search]);

	return (
		<ul aria-label="Ícones disponíveis" className="grid grid-cols-5 gap-2">
			{visibleIcons.map((icon) => {
				const Icon = categoryIcons[icon];
				const detail = iconDetails[icon];
				const isSelected = value === icon;

				return (
					<li key={icon}>
						<button
							aria-label={detail.label}
							aria-pressed={isSelected}
							className={cn(
								"flex min-h-22 w-full flex-col items-center justify-center gap-1 rounded-xl border px-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
								isSelected &&
									"border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
							)}
							onClick={() => onValueChange(icon)}
							type="button"
						>
							{Icon ? <Icon aria-hidden className="size-8" /> : null}
							<span className="min-h-7 w-full break-words text-center text-[10px] leading-tight">
								{detail.label}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

export function IconSelect({
	value,
	onValueChange,
	id,
	className,
}: {
	value: string;
	onValueChange: (value: string) => void;
	id?: string;
	className?: string;
}) {
	const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
	const [search, setSearch] = useState("");
	const isMobile = useIsMobile();
	const SelectedIcon = categoryIcons[value];

	if (isMobile) {
		return (
			<Sheet
				onOpenChange={(open) => {
					setMobileDrawerOpen(open);
					if (!open) setSearch("");
				}}
				open={mobileDrawerOpen}
			>
				<SheetTrigger asChild>
					<Button
						aria-haspopup="dialog"
						className={cn("w-full justify-between", className)}
						id={id}
						type="button"
						variant="outline"
					>
						<span className="flex items-center gap-2">
							{SelectedIcon ? (
								<SelectedIcon aria-hidden className="size-4" />
							) : null}
							<span>{value}</span>
						</span>
						<ChevronDown aria-hidden className="size-4 opacity-50" />
					</Button>
				</SheetTrigger>
				<SheetContent className="h-[85dvh] rounded-t-2xl" side="bottom">
					<SheetHeader className="shrink-0 pr-12 text-left">
						<SheetTitle>Escolha um ícone</SheetTitle>
					</SheetHeader>
					<div className="shrink-0 px-4">
						<Input
							aria-label="Buscar ícone"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Busque por alimentação, pet, saúde..."
							value={search}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
						<IconGrid
							onValueChange={(icon) => {
								onValueChange(icon);
								setMobileDrawerOpen(false);
							}}
							search={search}
							value={value}
						/>
					</div>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Select onValueChange={onValueChange} value={value}>
			<SelectTrigger className={cn("w-full", className)} id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{CATEGORY_ICONS.map((icon) => {
					const Icon = categoryIcons[icon];
					return (
						<SelectItem key={icon} value={icon}>
							<span className="flex items-center gap-2">
								{Icon ? (
									<Icon
										aria-hidden
										className="size-4 shrink-0 text-muted-foreground"
									/>
								) : null}
								<span>{icon}</span>
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
