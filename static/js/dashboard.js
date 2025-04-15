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
function actualizarDatos() {
    console.log('Iniciando actualización de datos...');
    $.ajax({
        url: '/api/datos',
        method: 'GET',
        success: function(response) {
            console.log('Datos recibidos:', response);
            
            // Actualizar estadísticas
            $('#total-sucursales').text(response.estadisticas.total_sucursales);
            $('#sucursales-procesadas').text(response.estadisticas.procesadas);
            $('#sucursales-pendientes').text(response.estadisticas.pendientes);
            $('#ultima-actualizacion').text(response.estadisticas.ultima_actualizacion);

            // Actualizar barra de progreso
            const porcentaje = (response.estadisticas.procesadas / response.estadisticas.total_sucursales * 100).toFixed(1);
            $('#progress-bar').css('width', porcentaje + '%').text(porcentaje + '%');

            // Actualizar totales
            $('#total-lista-blanca').text(response.estadisticas.totales.Lista_Blanca);
            $('#total-lista-celeste').text(response.estadisticas.totales.Lista_Celeste);
            $('#total-en-blanco').text(response.estadisticas.totales.En_Blanco);
            $('#total-anulados').text(response.estadisticas.totales.Anulados);
            $('#total-recurridos').text(response.estadisticas.totales.Recurridos);
            $('#total-observados').text(response.estadisticas.totales.Observados);

            // Actualizar el gráfico de torta
            pieChart.data.datasets[0].data = [
                response.estadisticas.totales.Lista_Blanca,
                response.estadisticas.totales.Lista_Celeste,
                response.estadisticas.totales.En_Blanco,
                response.estadisticas.totales.Anulados,
                response.estadisticas.totales.Recurridos,
                response.estadisticas.totales.Observados
            ];
            pieChart.update();

            // Actualizar tabla
            const tabla = $('#tabla-datos').DataTable();
            tabla.clear();

            response.datos.forEach(function(row) {
                const participacion = row.CantidadVotantes > 0 ? 
                    ((row.TotalVotos / row.CantidadVotantes) * 100).toFixed(1) + '%' : 
                    '0%';
                
                const deleteButton = `<button class="btn btn-danger btn-sm delete-btn" data-sucursal="${row.Sucursal}">
                    <i class="fas fa-trash"></i> Borrar
                </button>`;
                
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
                    deleteButton
                ]);
            });

            tabla.draw();
        },
        error: function(xhr, status, error) {
            console.error('Error al obtener datos:', error);
            alert('Error al cargar los datos. Revisa la consola para más detalles.');
        }
    });
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

    // Verificar sesión
    checkSession();

    // Cargar datos iniciales
    actualizarDatos();

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