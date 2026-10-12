const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const categorySelect = document.getElementById("categorySelect");
const deadlineInput = document.getElementById("deadlineInput");
const taskList = document.getElementById("taskList");
const taskCounter = document.getElementById("taskCounter");
const emptyMessage = document.getElementById("emptyMessage");
const errorMessage = document.getElementById("errorMessage");
const filterButtons = document.querySelectorAll(".filter-btn");

let tasks = JSON.parse(localStorage.getItem("minjiTasks")) || [];
let currentFilter = "all";

function saveTasks() {
    localStorage.setItem("minjiTasks", JSON.stringify(tasks));
}

function render() {
    taskList.innerHTML = "";

    let filteredTasks = tasks.filter(function(task) {
        if (currentFilter === "active") {
            return !task.selesai;
        }

        if (currentFilter === "completed") {
            return task.selesai;
        }

        return true;
    });

    filteredTasks.sort(function(a, b) {
        return new Date(a.deadline) - new Date(b.deadline);
    });

    if (filteredTasks.length === 0) {
        emptyMessage.style.display = "block";
    } else {
        emptyMessage.style.display = "none";
    }

    filteredTasks.forEach(function(task) {
        const li = document.createElement("li");
        li.className = "task-item";

        if (task.selesai) {
            li.classList.add("completed");
        }

        li.dataset.id = task.id;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "task-checkbox";
        checkbox.dataset.action = "toggle";
        checkbox.checked = task.selesai;

        const taskInfo = document.createElement("div");
        taskInfo.className = "task-info";

        const taskTitle = document.createElement("div");
        taskTitle.className = "task-title";
        taskTitle.textContent = task.judul;

        const taskMeta = document.createElement("div");
        taskMeta.className = "task-meta";
        taskMeta.textContent = `${task.matkul} · deadline ${formatDate(task.deadline)}`;

        taskInfo.appendChild(taskTitle);
        taskInfo.appendChild(taskMeta);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.dataset.action = "delete";
        deleteBtn.textContent = "×";
        deleteBtn.type = "button";

        li.appendChild(checkbox);
        li.appendChild(taskInfo);
        li.appendChild(deleteBtn);

        taskList.appendChild(li);
    });

    updateCounter();
}

function formatDate(date) {
    const [year, month, day] = date.split("-");
    return `${year}-${month}-${day}`;
}

function updateCounter() {
    const activeTasks = tasks.filter(function(task) {
        return !task.selesai;
    }).length;

    taskCounter.textContent = `${activeTasks} tugas aktif`;
}

taskForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const judul = taskInput.value.trim();
    const matkul = categorySelect.value;
    const deadline = deadlineInput.value;

    if (judul.length < 3) {
        errorMessage.textContent = "Judul tugas minimal 3 karakter.";
        taskInput.focus();
        return;
    }

    if (!matkul) {
        errorMessage.textContent = "Silakan pilih mata kuliah.";
        categorySelect.focus();
        return;
    }

    if (!deadline) {
        errorMessage.textContent = "Silakan pilih deadline.";
        deadlineInput.focus();
        return;
    }

    const newTask = {
        id: Date.now(),
        judul: judul,
        matkul: matkul,
        deadline: deadline,
        selesai: false
    };

    tasks.push(newTask);
    saveTasks();
    render();

    taskForm.reset();
    errorMessage.textContent = "";
    taskInput.focus();
});

taskList.addEventListener("change", function(event) {
    const target = event.target;

    if (!target.classList.contains("task-checkbox")) {
        return;
    }

    const taskItem = target.closest(".task-item");

    if (!taskItem) {
        return;
    }

    const id = Number(taskItem.dataset.id);

    const task = tasks.find(function(task) {
        return task.id === id;
    });

    if (task) {
        task.selesai = target.checked;
    }

    saveTasks();
    render();
});

taskList.addEventListener("click", function(event) {
    const target = event.target;

    if (!target.classList.contains("delete-btn")) {
        return;
    }

    const taskItem = target.closest(".task-item");

    if (!taskItem) {
        return;
    }

    const id = Number(taskItem.dataset.id);

    tasks = tasks.filter(function(task) {
        return task.id !== id;
    });

    saveTasks();
    render();
});

filterButtons.forEach(function(button) {
    button.addEventListener("click", function() {
        currentFilter = this.dataset.filter;

        filterButtons.forEach(function(btn) {
            btn.classList.remove("active");
        });

        this.classList.add("active");
        render();
    });
});

render();

const loadApiButton = document.getElementById("loadApiButton");
const sendJsonButton = document.getElementById("sendJsonButton");
const asyncStatus = document.getElementById("asyncStatus");
const apiTodoList = document.getElementById("apiTodoList");
const apiUsersSummary = document.getElementById("apiUsersSummary");
const postResult = document.getElementById("postResult");

function setAsyncStatus(message, type = "") {
    asyncStatus.textContent = message;
    asyncStatus.className = `async-status ${type}`.trim();
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || "Request gagal"}`);
    }

    return response.json();
}

async function loadApiData() {
    loadApiButton.disabled = true;
    apiTodoList.replaceChildren();
    apiUsersSummary.textContent = "";
    postResult.hidden = true;
    setAsyncStatus("Memuat data dari API...");

    try {
        const [todoData, userData] = await Promise.all([
            fetchJson("https://dummyjson.com/todos?limit=5"),
            fetchJson("https://dummyjson.com/users?limit=5")
        ]);

        if (!Array.isArray(todoData.todos) || !Array.isArray(userData.users)) {
            throw new Error("Format data API tidak sesuai.");
        }

        if (todoData.todos.length === 0) {
            setAsyncStatus("Request berhasil, tetapi data tugas kosong.");
        } else {
            todoData.todos.forEach(function (todo) {
                const item = document.createElement("li");
                item.textContent = `${todo.todo} — ${todo.completed ? "Selesai" : "Belum selesai"}`;
                apiTodoList.appendChild(item);
            });
            setAsyncStatus(`Berhasil memuat ${todoData.todos.length} tugas dari API.`, "success");
        }

        apiUsersSummary.textContent = `Request kedua juga berhasil: ${userData.users.length} pengguna berhasil diambil.`;
    } catch (error) {
        setAsyncStatus(`Gagal mengambil data: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui"}`, "error");
    } finally {
        loadApiButton.disabled = false;
    }
}

async function sendJsonExample() {
    sendJsonButton.disabled = true;
    postResult.hidden = true;
    setAsyncStatus("Mengirim contoh JSON...");

    const body = {
        todo: "Mempelajari async/await dan Fetch API",
        completed: false,
        userId: 1
    };

    try {
        const result = await fetchJson("https://dummyjson.com/todos/add", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        postResult.textContent = JSON.stringify(result, null, 2);
        postResult.hidden = false;
        setAsyncStatus("JSON berhasil dikirim. Respons di bawah adalah simulasi dari DummyJSON.", "success");
    } catch (error) {
        setAsyncStatus(`Gagal mengirim JSON: ${error instanceof Error ? error.message : "Kesalahan tidak diketahui"}`, "error");
    } finally {
        sendJsonButton.disabled = false;
    }
}

loadApiButton.addEventListener("click", loadApiData);
sendJsonButton.addEventListener("click", sendJsonExample);
