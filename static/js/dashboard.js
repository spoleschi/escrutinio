// Variable para almacenar todos los datos
let todosLosDatos = [];

// Inicializar el gráfico de torta
let pieChart = new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
        labels: ['Lista Blanca', 'Lista Celeste', 'En Blanco', 'Anulados', 'Recurridos', 'Observados'],
        datasets: [{
            data: [0, 0, 0, 0, 0, 0],
            backgroundColor: [
                'rgba(248, 249, 250, 0.8)',    // Lista Blanca - Blanco
                'rgba(13, 110, 253, 0.4)',  // Lista Celeste - Celeste
                'rgba(181, 187, 194, 0.8)',  // En Blanco - Gris
                'rgba(220, 53, 69, 0.4)',    // Anulados - Rojo
                'rgba(255, 193, 7, 0.4)',    // Recurridos - Amarillo
                'rgba(25, 135, 84, 0.4)'     // Observados - Verde
            ],
            borderWidth: 1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right'
            }
        }
    }
});

// Funciones de manejo de sesión
function checkSession() {
    console.log('Verificando sesión...');
    $.get('/api/check-session')
        .done(function(response) {
            console.log('Respuesta de sesión:', response);
            if (response.logged_in) {
                showLoggedInUser(response.user);
            } else {
                showLoggedOutState();
            }
        })
        .fail(function(error) {
            console.error('Error al verificar sesión:', error);
        });
}

function showLoggedInUser(user) {
    console.log('Mostrando usuario logueado:', user);

    // Ocultar modal de login
    $('#loginModal').modal('hide');

    setTimeout(() => {
        $('body').removeClass('modal-open'); // Eliminar clase de bloqueo
        $('.modal-backdrop').remove(); // Eliminar el fondo oscuro del modal
        $('body, html').css({
            'overflow': 'auto', // Habilitar el scroll
            'height': 'auto' // Ajustar altura de la página
        });

        console.log("Scroll restaurado");
    }, 300); // Esperar a que el modal termine de cerrarse

    // Actualizar UI
    $('#userName').text(user.nombre);
    $('#userInfo').removeClass('d-none');
    $('#btnLogin').addClass('d-none');
    $('#btnLogout').removeClass('d-none');

    // Mostrar columna de acciones en la tabla
    const tabla = $('#tabla-datos').DataTable();
    tabla.column(-1).visible(true);
    tabla.draw();
}

function showLoggedOutState() {
    console.log('Mostrando estado deslogueado');
    $('#userInfo').addClass('d-none');
    $('#btnLogin').removeClass('d-none');
    $('#btnLogout').addClass('d-none');
    
    // Ocultar columna de acciones en la tabla
    const tabla = $('#tabla-datos').DataTable();
    tabla.column(-1).visible(false);
    tabla.draw();
}

// Función principal de actualización de datos
// Función para filtrar los datos según la selección
function filtrarDatos(datos, filtro) {
    if (filtro === 'todas') {
        return datos;
    } else if (filtro === 'cargadas') {
        return datos.filter(row => row.TotalVotos > 0 || row.Procesado === 1);
    } else if (filtro === 'faltantes') {
        return datos.filter(row => row.TotalVotos === 0 && row.Procesado !== 1);
    }
    return datos;
}

// Función principal de actualización de datos
// Función para filtrar los datos según la selección
function filtrarDatos(datos, filtro) {
    if (filtro === 'todas') {
        return datos;
    } else if (filtro === 'cargadas') {
        return datos.filter(row => row.TotalVotos > 0 || row.Procesado === 1);
    } else if (filtro === 'faltantes') {
        return datos.filter(row => row.TotalVotos === 0 && row.Procesado !== 1);
    }
    return datos;
}

// Función principal de actualización de datos
// Función para filtrar los datos según la selección
function filtrarDatos(datos, filtro) {
    if (filtro === 'todas') {
        return datos;
    } else if (filtro === 'cargadas') {
        return datos.filter(row => row.TotalVotos > 0 || row.Procesado === 1);
    } else if (filtro === 'faltantes') {
        return datos.filter(row => row.TotalVotos === 0 && row.Procesado !== 1);
    }
    return datos;
}

// Función principal de actualización de datos
function actualizarDatos() {
    console.log('Iniciando actualización de datos...');
    
    $.ajax({
        url: '/api/datos',
        method: 'GET',
        success: function(response) {
            console.log('Datos recibidos:', response);
            
            // Guardar todos los datos para filtrar luego
            todosLosDatos = response.datos;
            
            // Actualizar estadísticas (siempre con todos los datos)
            $('#total-sucursales').text(response.estadisticas.total_sucursales);
            $('#sucursales-procesadas').text(response.estadisticas.procesadas);
            $('#sucursales-pendientes').text(response.estadisticas.pendientes);
            $('#ultima-actualizacion').text(response.estadisticas.ultima_actualizacion);

            // Actualizar barra de progreso (siempre con todos los datos)
            const porcentaje = (response.estadisticas.procesadas / response.estadisticas.total_sucursales * 100).toFixed(1);
            $('#progress-bar').css('width', porcentaje + '%').text(porcentaje + '%');

            // Actualizar totales (siempre con todos los datos)
            $('#total-lista-blanca').text(response.estadisticas.totales.Lista_Blanca);
            $('#total-lista-celeste').text(response.estadisticas.totales.Lista_Celeste);
            $('#total-en-blanco').text(response.estadisticas.totales.En_Blanco);
            $('#total-anulados').text(response.estadisticas.totales.Anulados);
            $('#total-recurridos').text(response.estadisticas.totales.Recurridos);
            $('#total-observados').text(response.estadisticas.totales.Observados);

            // Actualizar el gráfico de torta (siempre con todos los datos)
            pieChart.data.datasets[0].data = [
                response.estadisticas.totales.Lista_Blanca,
                response.estadisticas.totales.Lista_Celeste,
                response.estadisticas.totales.En_Blanco,
                response.estadisticas.totales.Anulados,
                response.estadisticas.totales.Recurridos,
                response.estadisticas.totales.Observados
            ];
            pieChart.update();

            // Aplicar filtro inicial
            aplicarFiltro();
        },
        error: function(xhr, status, error) {
            console.error('Error al obtener datos:', error);
            alert('Error al cargar los datos. Revisa la consola para más detalles.');
        }
    });
}

// Función para aplicar el filtro actual a los datos
function aplicarFiltro() {
    if (todosLosDatos.length === 0) return;
    
    const filtro = $('#filtro-sucursales').val();
    const datosFiltrados = filtrarDatos(todosLosDatos, filtro);
    
    // Actualizar tabla con datos filtrados
    const tabla = $('#tabla-datos').DataTable();
    tabla.clear();

    datosFiltrados.forEach(function(row) {
        const participacion = row.CantidadVotantes > 0 ? 
            ((row.TotalVotos / row.CantidadVotantes) * 100).toFixed(1) + '%' : 
            '0%';
        
        const actionButtons = `
            <div class="d-flex">
                <button class="btn btn-success btn-sm cargar-btn w-80px" style="width: 80px;" data-sucursal="${row.Sucursal}" 
                    data-votos='${JSON.stringify({
                        listaBlanca: row.Lista_Blanca,
                        listaCeleste: row.Lista_Celeste,
                        enBlanco: row.En_Blanco,
                        anulados: row.Anulados,
                        recurridos: row.Recurridos,
                        observados: row.Observados
                    })}' ${row.Procesado ? 'data-procesado="1"' : ''}>
                    <i class="fas fa-edit"></i> ${row.Procesado ? 'Editar' : 'Cargar'}
                </button>
                ${row.Procesado ? 
                `<button class="btn btn-danger btn-sm delete-btn ms-2" data-sucursal="${row.Sucursal}">
                    <i class="fas fa-trash"></i> Borrar
                </button>` : 
                `<div style="width: 83px;"></div>`}
            </div>`;
        
        tabla.row.add([
            row.Sucursal,
            row.Procesado ? '<span class="badge bg-success">Procesado</span>' : 
                        '<span class="badge bg-warning">Pendiente</span>',
            row.CantidadVotantes,
            row.Lista_Blanca,
            row.Lista_Celeste,
            row.En_Blanco,
            row.Anulados,
            row.Recurridos,
            row.Observados,
            row.TotalVotos,
            participacion,
            actionButtons
        ]);
    });

    tabla.draw();
}

// Event Handlers
$(document).ready(function() {
    console.log('Inicializando aplicación...');
    
    // Inicializar DataTable
    $('#tabla-datos').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.10.25/i18n/Spanish.json'
        },
        pageLength: 25,
        order: [[0, 'asc']],
        dom: '<"mb-3"l><"mb-3"f>rtip',
        columns: [
            { title: 'Sucursal' },
            { title: 'Estado' },
            { title: 'Votantes' },
            { title: 'Lista Blanca' },
            { title: 'Lista Celeste' },
            { title: 'En Blanco' },
            { title: 'Anulados' },
            { title: 'Recurridos' },
            { title: 'Observados' },
            { title: 'Total Votos' },
            { title: '% Participación' },
            { 
                title: 'Acciones',
                visible: false,
                orderable: false,
                className: 'text-center'
            }
        ]
    });

    // Handler para cálculo automático del total de votos
    $(document).on('input', '.votos-input', function() {
        calcularTotalVotos();
    });

    function calcularTotalVotos() {
        let total = 0;
        $('.votos-input').each(function() {
            const valor = parseInt($(this).val()) || 0;
            total += valor;
        });
        $('#totalVotos').val(total);
    }

    // Verificar sesión
    checkSession();

    // Cargar datos iniciales
    actualizarDatos();
    
    // Evento para el combo de filtro
    $('#filtro-sucursales').change(function() {
        aplicarFiltro();
    });

    // Actualizar datos cada 5 minutos
    setInterval(actualizarDatos, 300000);
});

// Login handlers
$('#btnSubmitLogin').click(function() {
    const username = $('#username').val();
    const password = $('#password').val();
    
    if (!username || !password) {
        $('#loginError').text('Por favor complete todos los campos').removeClass('d-none');
        return;
    }
    
    console.log('Intentando login...');
    $.ajax({
        url: '/api/login',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ username, password }),
        success: function(response) {
            console.log('Login exitoso:', response);
            if (response.success) {
                showLoggedInUser(response.user);
                $('#loginForm')[0].reset();
                $('#loginError').addClass('d-none');
            }
        },
        error: function(xhr) {
            console.error('Error en login:', xhr);
            const response = xhr.responseJSON;
            $('#loginError').text(response?.message || 'Error al iniciar sesión').removeClass('d-none');
        }
    });
});

$('#btnLogout').click(function() {
    console.log('Iniciando logout...');
    $.get('/api/logout')
        .done(function(response) {
            console.log('Logout exitoso:', response);
            showLoggedOutState();
        })
        .fail(function(error) {
            console.error('Error en logout:', error);
        });
});

// Export handler
$('#btn-exportar').click(function() {
    window.location.href = '/api/exportar-excel';
});

// Delete handler
$(document).on('click', '.delete-btn', function() {
    const sucursal = $(this).data('sucursal');
    
    if (confirm(`¿Está seguro que desea borrar los datos de la sucursal ${sucursal}?`)) {
        console.log('Intentando borrar sucursal:', sucursal);
        $.ajax({
            url: `/api/borrar-sucursal/${sucursal}`,
            method: 'DELETE',
            success: function(response) {
                console.log('Sucursal borrada:', response);
                alert('Sucursal eliminada correctamente');
                actualizarDatos();
            },
            error: function(xhr) {
                console.error('Error al borrar sucursal:', xhr);
                const response = xhr.responseJSON;
                alert(response?.error || 'Error al eliminar la sucursal');
            }
        });
    }
});

// Cargar datos handler
$(document).on('click', '.cargar-btn', function() {
    const sucursal = $(this).data('sucursal');
    const esProcesado = $(this).data('procesado') === 1;
    const votos = $(this).data('votos');
    
    // Resetear formulario
    $('#cargarVotosForm')[0].reset();
    $('#cargarError').addClass('d-none');
    
    // Llenar campos del modal
    $('#sucursalId').val(sucursal);
    $('#nombreSucursal').text(sucursal);
    
    // Si ya tiene datos cargados, mostrarlos
    if (esProcesado && votos) {
        $('#listaBlanca').val(votos.listaBlanca);
        $('#listaCeleste').val(votos.listaCeleste);
        $('#enBlanco').val(votos.enBlanco);
        $('#anulados').val(votos.anulados);
        $('#recurridos').val(votos.recurridos);
        $('#observados').val(votos.observados);
        
        // Calcular el total
        const total = votos.listaBlanca + votos.listaCeleste + votos.enBlanco + 
                    votos.anulados + votos.recurridos + votos.observados;
        $('#totalVotos').val(total);
    } else {
        // Si es una nueva carga, inicializar con ceros
        $('.votos-input').val(0);
        $('#totalVotos').val(0);
    }
    
    // Mostrar modal
    $('#cargarVotosModal').modal('show');
});

// Cargar votos submit handler
$('#btnSubmitCargar').click(function() {
    const sucursal = $('#sucursalId').val();
    const listaBlanca = parseInt($('#listaBlanca').val()) || 0;
    const listaCeleste = parseInt($('#listaCeleste').val()) || 0;
    const enBlanco = parseInt($('#enBlanco').val()) || 0;
    const anulados = parseInt($('#anulados').val()) || 0;
    const recurridos = parseInt($('#recurridos').val()) || 0;
    const observados = parseInt($('#observados').val()) || 0;
    const total = parseInt($('#totalVotos').val()) || 0;
    
    // Validación básica
    if (!sucursal) {
        $('#cargarError').text('Error: No se ha especificado la sucursal').removeClass('d-none');
        return;
    }
    
    // Confirmar total correcto
    const calculado = listaBlanca + listaCeleste + enBlanco + anulados + recurridos + observados;
    if (calculado !== total) {
        $('#cargarError').text(`Error: La suma de votos (${calculado}) no coincide con el total (${total})`).removeClass('d-none');
        return;
    }
    
    // Preparar datos para enviar
    const datos = {
        sucursal: sucursal,
        Lista_Blanca: listaBlanca,
        Lista_Celeste: listaCeleste,
        En_Blanco: enBlanco,
        Anulados: anulados,
        Recurridos: recurridos,
        Observados: observados,
        Total: total
    };
    
    console.log('Guardando datos de votos:', datos);
    
    // Enviar datos al servidor
    $.ajax({
        url: '/api/guardar-votos',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(datos),
        success: function(response) {
            console.log('Votos guardados:', response);
            $('#cargarVotosModal').modal('hide');
            alert('Datos guardados correctamente');
            actualizarDatos();
        },
        error: function(xhr) {
            console.error('Error al guardar votos:', xhr);
            const response = xhr.responseJSON;
            $('#cargarError').text(response?.error || 'Error al guardar los datos').removeClass('d-none');
        }
    });
});