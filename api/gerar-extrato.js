const puppeteer = require('puppeteer');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Inicializa o dotenv para carregar variáveis do arquivo .env
dotenv.config();

// Token estático para autenticação
const BEARER_TOKEN = process.env['auth_token'];

// Função para renderizar o template EJS
function renderTemplate(app, templateName, data) {
    return new Promise((resolve, reject) => {
        app.render(templateName, data, (err, html) => {
            if (err) {
                return reject(err);
            }
            resolve(html);
        });
    });
}

// Função para validar as transações
function validarTransacoes(transacoes) {
    const transacoesValidas = transacoes.filter(transacao => {
        const { data, descricao, valor } = transacao;
        const isValid = (data && descricao && valor) || (!data && !descricao && !valor);
        return isValid;
    });

    const transacoesInvalidas = transacoes.length - transacoesValidas.length;
    return {
        validas: transacoesValidas,
        invalidas: transacoesInvalidas
    };
}

module.exports = async (req, res) => {
    // Importação dinâmica do `pdf-merger-js`
    const PDFMerger = (await import('pdf-merger-js')).default;

    // Verificação do token de autorização
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== BEARER_TOKEN) {
        return res.status(401).json({
            message: "Erro: Token inválido ou ausente."
        });
    }

    const dados = req.body;  // Dados enviados no corpo da requisição
    const bancos = dados.bancos;  // Bancos vindos da requisição

    // Verifica se o payload está vazio
    if (!dados || !bancos || bancos.length === 0) {
        return res.status(400).json({
            message: "Erro: O payload não pode estar vazio. Pelo menos um banco com transações deve ser enviado."
        });
    }

    try {
        const browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const itensPorPagina = 5;
        const bancosPorPagina = 2;
        const pdfFilePath = path.join(__dirname, '..', 'extratos', `extrato-${dados.nomeUsuario}-${Date.now()}.pdf`);
        const merger = new PDFMerger(); // Instância para juntar os PDFs temporários

        // Quebrar os bancos em grupos de 2
        const gruposDeBancos = [];
        for (let i = 0; i < bancos.length; i += bancosPorPagina) {
            gruposDeBancos.push(bancos.slice(i, i + bancosPorPagina));
        }

        // Processa cada grupo de bancos (até 2 bancos por página)
        for (let grupo of gruposDeBancos) {
            const bancosValidos = [];

            // Valida as transações para cada banco do grupo
            for (let banco of grupo) {
                if (!banco.transacoes || banco.transacoes.length === 0) {
                    return res.status(400).json({
                        message: `Erro: O banco ${banco.nome} deve conter pelo menos uma transação.`
                    });
                }

                const validacao = validarTransacoes(banco.transacoes);
                banco.transacoes = validacao.validas;
            
                if (validacao.invalidas > 0) {
                    return res.status(400).json({
                        message: `Erro: ${validacao.invalidas} transações inválidas encontradas no banco ${banco.nome}.`
                    });
                }

                bancosValidos.push(banco);
            }

            // Gera o HTML para a página atual, incluindo até 2 bancos e suas transações paginadas
            const html = await renderTemplate(req.app, 'extrato', {
                nomeUsuario: dados.nomeUsuario,
                numeroContas: dados.numeroContas,
                dataInicio: dados.dataInicio,
                dataFim: dados.dataFim,
                bancos: bancosValidos
            });

            // Estilos aplicados para ajustar à folha A4
            const htmlComEstilos = `
                <style>
                    .content {
                        width: 100%;
                        height: 100%;
                        padding: 10mm;
                        box-sizing: border-box;
                        overflow: hidden;
                    }
                </style>
                <div class="content">
                    ${html}
                </div>
            `;

            // Carrega o conteúdo HTML gerado pelo EJS com os estilos aplicados
            await page.setContent(htmlComEstilos);

            // Gera o PDF temporário para a página atual
            const tempPdfPath = path.join(__dirname, '..', 'extratos', `temp-${Date.now()}.pdf`);
            await page.pdf({
                path: tempPdfPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0mm',
                    bottom: '0mm',
                    left: '0mm',
                    right: '0mm'
                },
                width: '210mm',
                height: '297mm'
            });

            // Adiciona o PDF temporário ao merger
            merger.add(tempPdfPath);
        }

        // Fecha o navegador
        await browser.close();

        // Junta todos os PDFs temporários em um único arquivo
        await merger.save(pdfFilePath);

        // Limpa os PDFs temporários
        fs.readdirSync(path.join(__dirname, '..', 'extratos')).forEach(file => {
            if (file.startsWith('temp-')) {
                fs.unlinkSync(path.join(__dirname, '..', 'extratos', file));
            }
        });

        // Retorna o arquivo PDF final
        res.json({
            message: 'PDF gerado com sucesso!',
            arquivo: `/extratos/extrato-unico-${Date.now()}.pdf`
        });

    } catch (error) {
        console.error('Erro ao gerar o extrato:', error);
        res.status(500).send('Erro ao gerar o extrato');
    }
};
